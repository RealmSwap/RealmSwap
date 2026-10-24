import fs from "fs";
import path from "path";
import { getServerDir, getFolderSizeBytes, DISK_WALK_TTL_MS } from "./diskUsage";

/**
 * "Where's my disk going": one classified walk of a server's install folder
 * that splits usage into worlds / mods / logs / other. The world prefixes
 * are grounded in getSavePath (backupPaths.ts) so "worlds" means exactly
 * what backups protect; mods/logs use each game's real on-disk layout.
 *
 * Same throttling contract as diskUsage: walks are cached (5-min TTL,
 * in-flight dedupe) because installs can hold tens of thousands of files.
 */

export type StorageBucket = "worlds" | "mods" | "logs";

// Lowercase, POSIX-separated, relative to the server folder.
const WORLD_PREFIXES: Record<string, string[]> = {
  MINECRAFT: ["world"],
  ENSHROUDED: ["enshrouded-server/savegame"],
  ZOMBOID: ["zomboid-server/zomboid-data/saves"],
  ARK: ["ark-server/shootergame/saved/savedarkslocal"],
  VALHEIM: [], // worlds live under the OS user profile, outside the server folder
};

const MOD_PREFIXES: Record<string, string[]> = {
  MINECRAFT: ["mods"],
  VALHEIM: ["bepinex", "plugins"],
  ZOMBOID: ["steamapps/workshop"],
  ARK: ["ark-server/shootergame/content/mods"],
  ENSHROUDED: [],
};

const LOG_PREFIXES: Record<string, string[]> = {
  MINECRAFT: ["logs"],
  VALHEIM: ["logs"],
  ZOMBOID: ["zomboid-server/zomboid-data/logs"],
  ARK: ["ark-server/shootergame/saved/logs"],
  ENSHROUDED: ["logs"],
};

export interface ServerStorageBreakdown {
  totalBytes: number;
  worldsBytes: number;
  modsBytes: number;
  logsBytes: number;
  otherBytes: number;
}

/**
 * Which bucket does a path inside the server folder belong to? Pure and
 * game-driven; anything unmatched (game binaries, configs, loader
 * runtimes…) lands in "other" rather than being guessed at.
 */
export function classifyServerDir(game: string, relPath: string): StorageBucket | null {
  const rel = relPath.replace(/\\/g, "/").toLowerCase();
  if (!rel) return null;
  const candidates: { prefix: string; bucket: StorageBucket }[] = [
    ...(WORLD_PREFIXES[game.toUpperCase()] ?? []).map((prefix) => ({ prefix, bucket: "worlds" as const })),
    ...(MOD_PREFIXES[game.toUpperCase()] ?? []).map((prefix) => ({ prefix, bucket: "mods" as const })),
    ...(LOG_PREFIXES[game.toUpperCase()] ?? ["logs"]).map((prefix) => ({ prefix, bucket: "logs" as const })),
  ];
  let best: { prefix: string; bucket: StorageBucket } | null = null;
  for (const c of candidates) {
    const matches = rel === c.prefix || rel.startsWith(c.prefix + "/");
    if (matches && (!best || c.prefix.length > best.prefix.length)) best = c;
  }
  return best?.bucket ?? null;
}

export async function getServerStorageBreakdown(
  serverId: string,
  game: string,
  opts: { awaitFresh?: boolean } = {}
): Promise<ServerStorageBreakdown | null> {
  const store = breakdownCache();
  const entry = store.get(serverId);
  const fresh = entry && Date.now() - entry.at < DISK_WALK_TTL_MS;
  if (entry && fresh && !entry.pending) return entry.value;

  if (entry?.pending && !opts.awaitFresh) {
    return entry.value; // re-walk already running; last known is good enough
  }

  const walk = walkServerStorage(getServerDir(serverId), game)
    .then((value) => {
      store.set(serverId, { value, at: Date.now() });
      return value;
    })
    .catch(() => {
      const fallback = { value: entry?.value ?? null, at: Date.now() };
      store.set(serverId, fallback);
      return fallback.value;
    });
  store.set(serverId, { value: entry?.value ?? null, at: entry?.at ?? 0, pending: walk });

  if (opts.awaitFresh) {
    const value = await walk.finally(() => {
      const e = store.get(serverId);
      if (e) delete e.pending;
    });
    return value;
  }
  return entry?.value ?? null;
}

/**
 * One classified walk of a server root. Exported for tests — pass any
 * directory laid out like a server install. Returns null when the folder
 * doesn't exist (no local install — honest null, like the disk tile).
 */
export async function walkServerStorage(root: string, game: string): Promise<ServerStorageBreakdown | null> {
  try {
    const st = await fs.promises.stat(root);
    if (!st.isDirectory()) return null;
  } catch {
    return null;
  }

  const out: ServerStorageBreakdown = { totalBytes: 0, worldsBytes: 0, modsBytes: 0, logsBytes: 0, otherBytes: 0 };
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const rel = path.relative(root, current);
    const bucket = classifyServerDir(game, rel);
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue; // unreadable dir — count what we can reach
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(child);
      } else if (entry.isFile()) {
        try {
          const st = await fs.promises.stat(child);
          out.totalBytes += st.size;
          if (bucket === "worlds") out.worldsBytes += st.size;
          else if (bucket === "mods") out.modsBytes += st.size;
          else if (bucket === "logs") out.logsBytes += st.size;
          else out.otherBytes += st.size;
        } catch {
          // raced away (deleted mid-walk) — skip
        }
      }
    }
  }
  return out;
}

interface BreakdownCacheEntry {
  value: ServerStorageBreakdown | null;
  at: number;
  pending?: Promise<ServerStorageBreakdown | null>;
}

const globalForStorage = globalThis as unknown as {
  __storageBreakdownCache: Map<string, BreakdownCacheEntry> | undefined;
  __storagePathCache: Map<string, { bytes: number | null; at: number }> | undefined;
};

function breakdownCache(): Map<string, BreakdownCacheEntry> {
  if (!globalForStorage.__storageBreakdownCache) globalForStorage.__storageBreakdownCache = new Map();
  return globalForStorage.__storageBreakdownCache;
}

/**
 * Size of an arbitrary folder (snapshot clones, backup zips' folders),
 * cached for the same 5-minute window — the Storage page sums several
 * full server clones and must not re-walk them on every load.
 */
export async function getFolderSizeBytesCached(dir: string): Promise<number | null> {
  if (!globalForStorage.__storagePathCache) globalForStorage.__storagePathCache = new Map();
  const cache = globalForStorage.__storagePathCache;
  const entry = cache.get(dir);
  if (entry && Date.now() - entry.at < DISK_WALK_TTL_MS) return entry.bytes;
  const bytes = await getFolderSizeBytes(dir).catch(() => null);
  cache.set(dir, { bytes, at: Date.now() });
  return bytes;
}
