/**
 * Pure auto-stop rules — no prisma, no runners, safe to import anywhere
 * (tests, client, the monitor). The engine that samples players and stops
 * servers lives in autoStop.ts.
 *
 * Fail-open by design:
 *  - a failed, timed-out, or unsupported game query NEVER counts as "empty"
 *    — it resets the empty streak;
 *  - the streak lives in memory in the engine, so an app restart resets it;
 *  - a stop only fires while the game actually answered "0 players".
 */

export const PLAYER_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;

export type AutoStopKind = "idle" | "session";

export interface AutoStopInput {
  online: boolean; // the game query answered
  players: number;
  idleStopEnabled: boolean;
  idleStopMinutes: number;
  sessionAutoStopHours: number; // 0 = off
  latestSessionStartTime: Date | string | null; // most recent planned session whose start has passed
  emptyStreakBefore: number; // consecutive empty SAMPLES (5 min apart)
  now: Date;
}

export interface AutoStopVerdict {
  stop: boolean;
  kind?: AutoStopKind;
  emptyStreakAfter: number;
}

/**
 * Samples are PLAYER_SAMPLE_INTERVAL_MS apart, so the idle threshold is the
 * streak length covering idleStopMinutes (rounded up — a 12-minute setting
 * stops at the 15-minute sample, never earlier).
 */
export function evaluateAutoStop(input: AutoStopInput): AutoStopVerdict {
  // A query that didn't answer can't prove the server is empty.
  if (!input.online) return { stop: false, emptyStreakAfter: 0 };
  if (input.players > 0) return { stop: false, emptyStreakAfter: 0 };

  const emptyStreakAfter = input.emptyStreakBefore + 1;

  const idleThreshold = Math.max(1, Math.ceil(input.idleStopMinutes / (PLAYER_SAMPLE_INTERVAL_MS / 60_000)));
  if (input.idleStopEnabled && emptyStreakAfter >= idleThreshold) {
    return { stop: true, kind: "idle", emptyStreakAfter };
  }

  if (input.sessionAutoStopHours > 0 && input.latestSessionStartTime) {
    const startedAt = new Date(input.latestSessionStartTime).getTime();
    if (input.now.getTime() - startedAt >= input.sessionAutoStopHours * 60 * 60 * 1000) {
      return { stop: true, kind: "session", emptyStreakAfter };
    }
  }

  return { stop: false, emptyStreakAfter };
}
