import fs from "fs";
import path from "path";
import { dataRoot } from "./appPaths";

/**
 * Real disk usage for a server: the size of its install folder on the host
 * (`<dataRoot>/local-servers/<serverId>` — both LocalRunner and DockerRunner
 * bind-mount that path) plus the free space of the drive it lives on.
 *
 * Folder walks are throttled through a module-level cache because a large
 * install can hold tens of thousands of files; the process monitor samples
 * every 10s but must not walk that often.
 */

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * 1024 * 1024;

export const DISK_WALK_TTL_MS = 5 * 60_000;

export function getServerDir(serverId: string): string {
  return path.join(dataRoot(), "local-servers", serverId);
}

/**
 * Recursively sums file sizes under `dir`. Returns null when the folder
 * itself doesn't exist (no local install). Unreadable subdirectories and
 * files that race away mid-walk are skipped (best-effort); symlinks are
 * never followed.
 */
export async function getFolderSizeBytes(dir: string): Promise<number | null> {
  try {
    const st = await fs.promises.stat(dir);
    if (!st.isDirectory()) return null;
  } catch {
    return null;
  }

  let total = 0;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
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
          total += st.size;
        } catch {
          // raced away (deleted mid-walk) — skip
        }
      }
    }
  }
  return total;
}

const globalForDisk = globalThis as unknown as {
  diskSizeCache: Map<string, { bytes: number | null; at: number; pending?: Promise<number | null> }> | undefined;
};

function cache(): Map<string, { bytes: number | null; at: number; pending?: Promise<number | null> }> {
  if (!globalForDisk.diskSizeCache) globalForDisk.diskSizeCache = new Map();
  return globalForDisk.diskSizeCache;
}

/**
 * Server folder size in bytes, cache-first. With `awaitFresh` (the API route)
 * a stale entry blocks on a re-walk; without it (the 10s telemetry tick) the
 * last known value returns immediately and a re-walk is kicked off in the
 * background — the tick never waits on a filesystem walk.
 */
export async function getServerDiskBytes(
  serverId: string,
  opts: { awaitFresh?: boolean } = {}
): Promise<number | null> {
  const store = cache();
  const entry = store.get(serverId);
  const fresh = entry && Date.now() - entry.at < DISK_WALK_TTL_MS;
  if (entry && fresh) return entry.bytes;

  if (entry?.pending && !opts.awaitFresh) {
    return entry.bytes; // re-walk already running; last known is good enough
  }

  const walk = getFolderSizeBytes(getServerDir(serverId))
    .then((bytes) => {
      store.set(serverId, { bytes, at: Date.now() });
      return bytes;
    })
    .catch(() => {
      store.set(serverId, { bytes: entry?.bytes ?? null, at: Date.now() });
      return entry?.bytes ?? null;
    });
  store.set(serverId, { bytes: entry?.bytes ?? null, at: entry?.at ?? 0, pending: walk });

  if (opts.awaitFresh) {
    const bytes = await walk.finally(() => {
      const e = store.get(serverId);
      if (e) delete e.pending;
    });
    return bytes;
  }
  return entry?.bytes ?? null;
}

export function bytesToGB(bytes: number | null): number | null {
  return bytes === null ? null : Math.round((bytes / BYTES_PER_GB) * 100) / 100;
}

export function bytesToMB(bytes: number | null): number | null {
  return bytes === null ? null : Math.round(bytes / BYTES_PER_MB);
}
