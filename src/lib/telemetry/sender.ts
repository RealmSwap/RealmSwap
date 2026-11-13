import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeUsageSnapshot, utcDay, type UsageSnapshot } from "./usage";
import { getUsageTelemetryState, markUsageSent } from "./consent";

/**
 * Sends the day's anonymous snapshot. Nothing happens without consent, and
 * a failure is logged and swallowed — telemetry must never make noise, let
 * alone break anything.
 *
 * The insert goes out with the public anon key and no session: the row lands
 * via the `usage_snapshots` insert-only RLS policy and carries no account
 * identity. One day is sent once; the primary key rejects a repeat and that
 * counts as success.
 */

let anonClient: SupabaseClient | null = null;

function anonSupabase(): SupabaseClient | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  anonClient ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anonClient;
}

export type UsageSendResult = "sent" | "off" | "unconfigured" | "already-sent" | "failed";

export async function maybeSendUsageSnapshot(
  now: Date = new Date(),
  opts: { force?: boolean } = {},
): Promise<UsageSendResult> {
  const state = await getUsageTelemetryState();
  if (!state.enabled) return "off";
  const supabase = anonSupabase();
  if (!supabase) return "unconfigured";

  const day = utcDay(now);
  if (!opts.force && state.lastSentDay === day) return "already-sent";

  let snapshot: UsageSnapshot;
  try {
    snapshot = await computeUsageSnapshot(now);
  } catch (err: any) {
    console.error("[Telemetry] could not build the usage snapshot:", err?.message);
    return "failed";
  }

  const { error } = await supabase.from("usage_snapshots").insert({
    install_id: state.installId,
    day,
    app_version: snapshot.appVersion,
    platform: snapshot.platform,
    servers: snapshot.servers,
    games: snapshot.games,
    deployed: snapshot.deployed,
    first_online: snapshot.first_online,
    mods: snapshot.mods,
    invite: snapshot.invite,
    friend_joined: snapshot.friend_joined,
    status_share: snapshot.status_share,
    session_planned: snapshot.session_planned,
    remote_host: snapshot.remote_host,
    active: snapshot.active,
  });
  if (error) {
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      await markUsageSent(day, state.installId!);
      return "already-sent";
    }
    console.error("[Telemetry] usage snapshot send failed:", error.message);
    return "failed";
  }
  await markUsageSent(day, state.installId!);
  return "sent";
}

/** Minute-loop friendly: one attempt per hour at most. */
const globalForTelemetry = globalThis as unknown as {
  usageTelemetryInterval?: NodeJS.Timeout;
  usageTelemetryLastRun?: number;
};

export function startUsageTelemetry(intervalMs = 60 * 60_000): void {
  if (globalForTelemetry.usageTelemetryInterval) return;
  const tick = () => {
    if (Date.now() - (globalForTelemetry.usageTelemetryLastRun ?? 0) < intervalMs) return;
    globalForTelemetry.usageTelemetryLastRun = Date.now();
    maybeSendUsageSnapshot().then((result) => {
      if (result === "failed") console.error("[Telemetry] retrying within the hour");
    });
  };
  tick();
  globalForTelemetry.usageTelemetryInterval = setInterval(tick, 60_000);
}
