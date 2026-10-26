import type { ServerStorageBreakdown } from "@/lib/storageUsage";
import { bucketPrefixesForGame } from "@/lib/storageUsage";
import { enqueueCommand, awaitCommandResult, resolveUsableNode } from "./commands";
import type { CommandPayload } from "./protocol";

/**
 * Per-server storage truth for AGENT servers. The Storage page and disk
 * tile walk `<dataRoot>/local-servers/<id>` — the wrong machine for a node
 * server (a stale folder would make the UI quietly lie). Here the NODE does
 * the classified walk (DISK_USAGE carries the dashboard's prefix lists) and
 * the result feeds the same 5-minute-TTL cache contract the local walks use,
 * so the 10s telemetry tick stamps real numbers without running commands.
 */

const DISK_USAGE_TIMEOUT_MS = 10 * 60_000;

const globalForAgentDisk = globalThis as unknown as {
  __agentDiskCache: Map<string, { value: ServerStorageBreakdown | null; at: number; pending?: Promise<ServerStorageBreakdown | null> }> | undefined;
};

function cache(): Map<string, { value: ServerStorageBreakdown | null; at: number; pending?: Promise<ServerStorageBreakdown | null> }> {
  if (!globalForAgentDisk.__agentDiskCache) globalForAgentDisk.__agentDiskCache = new Map();
  return globalForAgentDisk.__agentDiskCache;
}

const TTL_MS = 5 * 60_000;

/** Last known breakdown without commanding the node (telemetry tick). */
export function cachedAgentStorageBreakdown(serverId: string): ServerStorageBreakdown | null {
  const entry = cache().get(serverId);
  return entry?.value ?? null;
}

/** Node-classified breakdown, cache-first with in-flight dedupe — the same
 *  contract as getServerStorageBreakdown for local servers. */
export async function agentStorageBreakdown(
  serverId: string,
  game: string,
  opts: { awaitFresh?: boolean } = {}
): Promise<ServerStorageBreakdown | null> {
  const store = cache();
  const entry = store.get(serverId);
  if (entry && Date.now() - entry.at < TTL_MS && !entry.pending) return entry.value;
  if (entry?.pending && !opts.awaitFresh) return entry.value;

  const walk = (async () => {
    try {
      const node = await resolveUsableNode(serverId);
      const { id } = await enqueueCommand(node.id, serverId, "DISK_USAGE", {
        kind: "DISK_USAGE",
        dataDirName: serverId,
        buckets: bucketPrefixesForGame(game),
      } satisfies CommandPayload);
      const outcome = await awaitCommandResult(id, DISK_USAGE_TIMEOUT_MS);
      if (!outcome.ok) return entry?.value ?? null;
      const parsed = JSON.parse(outcome.output ?? "{}") as {
        totalBytes?: number;
        buckets?: Record<string, number>;
      };
      if (typeof parsed.totalBytes !== "number") return entry?.value ?? null;
      const buckets = parsed.buckets ?? {};
      const worlds = buckets.worlds ?? 0;
      const mods = buckets.mods ?? 0;
      const logs = buckets.logs ?? 0;
      const value: ServerStorageBreakdown = {
        totalBytes: parsed.totalBytes,
        worldsBytes: worlds,
        modsBytes: mods,
        logsBytes: logs,
        otherBytes: Math.max(0, parsed.totalBytes - worlds - mods - logs),
      };
      store.set(serverId, { value, at: Date.now() });
      return value;
    } catch {
      return entry?.value ?? null;
    }
  })();

  store.set(serverId, { value: entry?.value ?? null, at: entry?.at ?? 0, pending: walk });
  const value = await walk.finally(() => {
    const e = store.get(serverId);
    if (e) delete e.pending;
  });
  return value;
}
