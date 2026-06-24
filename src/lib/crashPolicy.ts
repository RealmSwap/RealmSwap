/**
 * Crash-detection / auto-restart policy for local game servers.
 *
 * Pure decision logic extracted from localRunner's process-exit handler so the
 * retry-window behavior is unit-testable without a DB or spawned processes. The
 * handler wires real exit codes + the shared crash-counter map into these.
 */

export const CRASH_MAX_RETRIES = 3;
export const CRASH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export type CrashCounter = { count: number; windowStart: number };

export type CrashDecision = {
  /** The counter value to persist for this server. */
  counter: CrashCounter;
  /** Within the retry budget — caller should auto-restart. */
  shouldRestart: boolean;
  /** Retry budget exhausted — caller should mark the server CRASHED. */
  exhausted: boolean;
};

/**
 * Whether a process exit should be treated as a crash. An intentional stop, a
 * clean exit (code 0), or a signal kill with no code are not crashes.
 */
export function isCrashExit(wasIntentional: boolean, code: number | null): boolean {
  return !wasIntentional && code !== null && code !== 0;
}

/**
 * Apply the crash to the rolling counter and decide whether to restart.
 *
 * If the previous window has fully elapsed (or there is no prior counter) the
 * count resets and starts a new window at `now`; otherwise it increments within
 * the existing window. A restart is allowed while the count stays below the max.
 */
export function evaluateCrash(
  prev: CrashCounter | undefined,
  now: number,
  opts?: { maxRetries?: number; windowMs?: number }
): CrashDecision {
  const maxRetries = opts?.maxRetries ?? CRASH_MAX_RETRIES;
  const windowMs = opts?.windowMs ?? CRASH_WINDOW_MS;

  let counter = prev;
  if (!counter || now - counter.windowStart > windowMs) {
    counter = { count: 0, windowStart: now };
  }
  counter = { count: counter.count + 1, windowStart: counter.windowStart };

  const shouldRestart = counter.count < maxRetries;
  return { counter, shouldRestart, exhausted: !shouldRestart };
}
