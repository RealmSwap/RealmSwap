/**
 * Per-game RCON save flushing for backups.
 *
 * Zipping a RUNNING server's save folder races the server's own writes — the
 * archive can pass verification yet contain a torn world. Games that expose a
 * save/flush command over RCON get one before the zip and a resume afterwards.
 * Games without a reliable command (Valheim, Rust, ARK, Terraria, Enshrouded)
 * are deliberately absent: their backups proceed unflushed exactly as before
 * rather than sending commands that pretend to help.
 */
export interface SaveFlushPlan {
  /** Commands sent before the zip; every one must succeed for the flush to count. */
  pre: string[];
  /** Commands sent after the zip (success or failure) to resume world writes. */
  post: string[];
}

export function getSaveFlushPlan(game: string): SaveFlushPlan | null {
  switch (game.toUpperCase()) {
    case "MINECRAFT":
      // save-all flush returns only after every pending chunk hit the disk,
      // and save-off keeps the autosave thread from writing mid-zip.
      return { pre: ["save-off", "save-all flush"], post: ["save-on"] };
    case "PALWORLD":
      // Palworld RCON "save" forces a synchronous world save.
      return { pre: ["save"], post: [] };
    case "ZOMBOID":
      // Project Zomboid RCON "save" writes the world and map.
      return { pre: ["save"], post: [] };
    default:
      return null;
  }
}

export interface SaveFlushSession {
  /** True when every pre command was accepted and post commands are pending. */
  flushed: boolean;
  /** Set when a pre command failed — the plan was already rolled back. */
  error?: string;
  /** Sends the post commands. Safe to call in a finally, always. */
  resume: () => Promise<void>;
}

/** rconManager.execute already swallows transport errors into null. */
export type SaveFlushExecutor = (command: string) => Promise<string | null>;

/**
 * Run a plan's pre commands. If any fails the post commands run immediately —
 * a half-applied plan must never leave a Minecraft server with autosave off —
 * and the returned session reports the failure while its resume() is a no-op.
 */
export async function beginSaveFlush(plan: SaveFlushPlan, execute: SaveFlushExecutor): Promise<SaveFlushSession> {
  const runPost = async () => {
    for (const cmd of plan.post) {
      try {
        await execute(cmd);
      } catch {
        // Resume is best-effort; never mask the original backup result.
      }
    }
  };

  for (const cmd of plan.pre) {
    let response: string | null = null;
    try {
      response = await execute(cmd);
    } catch {
      response = null;
    }
    if (response === null) {
      await runPost();
      return { flushed: false, error: `RCON command '${cmd}' failed`, resume: async () => {} };
    }
  }

  return { flushed: true, resume: runPost };
}

/**
 * Pick which backups to delete for a keep-last-N retention, given rows sorted
 * newest-first. The newest VERIFIED backup is always rescued even when it falls
 * outside the window — it is the only restore point proven restorable, so
 * retention may never evict it.
 * Returns rows to delete in newest-first order.
 */
export function pickBackupsToPrune<T extends { id: string; verifiedAt: Date | string | null }>(
  newestFirst: T[],
  retention: number
): T[] {
  if (!Number.isFinite(retention) || retention <= 0) return []; // 0 = keep everything
  const doomed = newestFirst.slice(retention);
  const newestVerifiedIndex = newestFirst.findIndex((b) => b.verifiedAt != null);
  if (newestVerifiedIndex >= retention) {
    const rescued = newestFirst[newestVerifiedIndex];
    return doomed.filter((b) => b.id !== rescued.id);
  }
  return doomed;
}
