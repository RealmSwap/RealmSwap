import fs from "fs";
import path from "path";

/**
 * Replace `targetDir` with `stagingDir` by rename-swap. The caller prepares
 * and validates stagingDir first; this function then moves the live
 * directory aside (intact, not deleted), renames the staged replacement into
 * place, and only deletes the old copy afterwards. If the final rename
 * fails, the old directory is moved back — the live directory is never left
 * empty or half-populated. This is the safety net under every world-writing
 * operation (backup restore, snapshot rollback, world import).
 */
export function swapDirIntoPlace(stagingDir: string, targetDir: string): void {
  const trashDir = `${targetDir}.replaced-${Date.now()}`;
  const hadTarget = fs.existsSync(targetDir);
  if (hadTarget) {
    fs.renameSync(targetDir, trashDir);
  }
  try {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.renameSync(stagingDir, targetDir);
  } catch (err) {
    if (hadTarget) {
      fs.renameSync(trashDir, targetDir); // put the live copy back
    }
    throw err;
  }
  try {
    if (hadTarget) fs.rmSync(trashDir, { recursive: true, force: true });
  } catch (err) {
    // The swap already succeeded; a leftover trash dir is disk clutter, not
    // a failed restore.
    console.error(`Failed to clean up replaced directory ${trashDir}:`, err);
  }
}

const serverLocks = new Map<string, Promise<unknown>>();

/**
 * Serialize destructive filesystem operations per server within this process:
 * backup create/restore, snapshot rollback, and world import all mutate the
 * same directories, and interleaving them (two restores, or a restore racing
 * a backup's folder walk) corrupts worlds without raising an error. Concurrent
 * callers queue instead of overlapping.
 */
export function withServerLock<T>(serverId: string, fn: () => Promise<T>): Promise<T> {
  const prev = serverLocks.get(serverId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn, fn);
  const release = next.finally(() => {
    if (serverLocks.get(serverId) === next) {
      serverLocks.delete(serverId);
    }
  });
  serverLocks.set(serverId, next);
  return release;
}
