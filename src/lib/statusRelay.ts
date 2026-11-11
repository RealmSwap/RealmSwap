import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "./db";

/**
 * Hosted status relay — the bridge between the host-local status page
 * (/s/<code>, src/lib/statusShare.ts) and realmswap.app/s/<code>, which keeps
 * answering even when the host PC is off.
 *
 * Writes carry the OWNER'S Supabase access token; `public_status` RLS
 * (auth.uid() = owner_id) is the write boundary, so no elevated key ever
 * ships inside the app. Pushes happen when a share is enabled and then at
 * most every RELAY_PUSH_INTERVAL_MS per server while it runs (wired into the
 * monitor tick). Failures are logged and swallowed — a down relay must never
 * take the dashboard down with it.
 *
 * The snapshot is deliberately leak-proof, mirroring the host-local contract:
 * name, game, up/down and player counts. Never addresses, passwords, host
 * identity, or player names.
 */

const RELAY_PUSH_INTERVAL_MS = 5 * 60_000;

type RelaySession = { accessToken: string; userId: string };

const globalForRelay = globalThis as unknown as {
  __statusRelay?: {
    session: RelaySession | null;
    lastPushAt: Map<string, number>;
  };
};

function relay() {
  if (!globalForRelay.__statusRelay) {
    globalForRelay.__statusRelay = { session: null, lastPushAt: new Map() };
  }
  return globalForRelay.__statusRelay;
}

/** True when the app has the (anon) Supabase env it needs to reach the relay target. */
export function isStatusRelayConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Called from getAuthenticatedUser on every authenticated request — the
 * owner's access token is what makes the RLS write possible from background
 * ticks. Refreshed constantly by dashboard traffic, so a 1h token expiry
 * self-heals the next time anyone opens the dashboard.
 */
export function cacheRelaySession(accessToken: string, userId: string) {
  if (!isStatusRelayConfigured()) return;
  relay().session = { accessToken, userId };
}

function relayClient(): SupabaseClient | null {
  if (!isStatusRelayConfigured()) return null;
  const { session } = relay();
  if (!session) return null; // no owner session observed yet — skip quietly
  // Built per push (at most once per interval per server) so a rotated
  // access token always rides the request that uses it.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
    }
  );
}

/**
 * Mirror the current snapshot for `serverId` into public_status. Rate-limited
 * per server unless force=true (share enable / rotate). No-op when the server
 * has no share code, the relay isn't configured, or no owner session has been
 * seen since boot.
 */
export async function relayStatusSnapshot(serverId: string, opts?: { force?: boolean }) {
  try {
    if (!isStatusRelayConfigured()) return;
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, game: true, status: true, statusShareCode: true },
    });
    if (!server?.statusShareCode) return;

    const now = Date.now();
    const last = relay().lastPushAt.get(serverId) ?? 0;
    if (!opts?.force && now - last < RELAY_PUSH_INTERVAL_MS) return;
    relay().lastPushAt.set(serverId, now);

    // Player counts ride the telemetry stamps (5-min sampler); a 15-min
    // window separates "numbers we saw recently" from "running but quiet".
    const stamp = await prisma.serverTelemetry.findFirst({
      where: { serverId, createdAt: { gte: new Date(now - 15 * 60_000) } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, playerCount: true, maxPlayers: true },
    });
    const isLive = server.status === "RUNNING" && stamp?.createdAt && now - stamp.createdAt.getTime() < 15 * 60_000;

    const client = relayClient();
    if (!client) return;
    const { error } = await client.from("public_status").upsert(
      {
        code: server.statusShareCode,
        owner_id: relay().session!.userId,
        name: server.name,
        game: server.game,
        status: server.status,
        players: isLive ? stamp!.playerCount : null,
        maxplayers: isLive ? stamp!.maxPlayers : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "code" }
    );
    if (error) console.warn(`[StatusRelay] push failed for ${serverId}:`, error.message);
  } catch (err: any) {
    console.warn(`[StatusRelay] push skipped for ${serverId}:`, err?.message);
  }
}

/** Remove the hosted row — a rotated-out or disabled code must stop answering. */
export async function removeHostedStatus(code: string) {
  try {
    if (!isStatusRelayConfigured()) return;
    const client = relayClient();
    if (!client) return;
    const { error } = await client.from("public_status").delete().eq("code", code);
    if (error) console.warn(`[StatusRelay] delete failed for ${code}:`, error.message);
  } catch (err: any) {
    console.warn(`[StatusRelay] delete skipped for ${code}:`, err?.message);
  }
}
