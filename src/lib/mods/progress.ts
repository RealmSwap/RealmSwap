/**
 * In-process progress hub for long-running mod operations (pack installs,
 * loader installs, boot verification). The install route emits stage/byte
 * events keyed by a client-generated installId; the SSE route relays them to
 * the Mod Manager's progress panel. Sessions are ephemeral: last event is
 * kept for catch-up when a subscriber connects mid-flight, and everything is
 * dropped shortly after the terminal event.
 */

export type ModProgressStage =
  | "resolving" | "snapshot" | "loader" | "mcswap" | "mods" | "overrides" | "boot"
  | "done" | "error";

export interface ModProgressEvent {
  stage: ModProgressStage;
  /** Human label for the current item (file name, loader name, …). */
  label?: string;
  /** Completed units within the current stage. */
  current?: number;
  /** Total units in the current stage, when known up front. */
  total?: number;
  /** Cumulative bytes downloaded across the whole operation. */
  bytesDone?: number;
  /** Total bytes when the provider reports sizes up front. */
  bytesTotal?: number;
  /** Rolling tail of the sandbox boot test's live output (boot stage). */
  bootLines?: string[];
  error?: string;
}

type Subscriber = (event: ModProgressEvent) => void;

interface ProgressSession {
  subs: Set<Subscriber>;
  last: ModProgressEvent;
  startedAt: number;
  terminal: boolean;
  endTimer?: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, ProgressSession>();
/** Sessions end 10s after their terminal event so SSE clients can drain it. */
const END_GRACE_MS = 10_000;
/** Abandoned sessions (no terminal event — e.g. a crashed route) age out. */
const STALE_MS = 30 * 60_000;

function sweepStale(now = Date.now()): void {
  Array.from(sessions.entries()).forEach(([id, session]) => {
    if (!session.terminal && now - session.startedAt > STALE_MS) {
      sessions.delete(id);
    }
  });
}

/** Open (or re-open) a session. Emits into an existing session if present. */
export function beginProgress(installId: string): void {
  sweepStale();
  if (!sessions.has(installId)) {
    sessions.set(installId, { subs: new Set(), last: { stage: "resolving" }, startedAt: Date.now(), terminal: false });
  }
}

/**
 * Merge the event into the session's current state and fan it out. Callers
 * send only what changed — { stage: "mods", current: 4 } keeps earlier
 * totals and byte counters.
 */
export function emitProgress(installId: string, event: Partial<ModProgressEvent>): ModProgressEvent | null {
  const session = sessions.get(installId);
  if (!session) return null;
  session.last = { ...session.last, ...event };
  for (const sub of Array.from(session.subs)) {
    try {
      sub(session.last);
    } catch {
      /* a broken subscriber must not break the install */
    }
  }
  return session.last;
}

/** Subscribe; fires immediately with the session's current state (catch-up). */
export function subscribeProgress(installId: string, sub: Subscriber): (() => void) | null {
  const session = sessions.get(installId);
  if (!session) return null;
  session.subs.add(sub);
  try {
    sub(session.last);
  } catch {
    /* catch-up delivery is best-effort */
  }
  return () => {
    session.subs.delete(sub);
  };
}

/** Terminal event: `done` or `error`. The session dies after a short grace. */
export function endProgress(installId: string, stage: "done" | "error", error?: string): void {
  const session = sessions.get(installId);
  if (!session) return;
  emitProgress(installId, { stage, ...(error ? { error } : {}) });
  session.terminal = true;
  session.endTimer = setTimeout(() => {
    sessions.delete(installId);
  }, END_GRACE_MS);
}

/**
 * Rolling boot-log tail for the progress panel. A modded boot test runs up
 * to ten minutes with nothing to show but a spinner — this buffers the
 * sandbox's live output lines and emits the last few as `bootLines`,
 * throttled so a chatty server can't flood the SSE stream.
 */
export function createBootLogEmitter(
  installId: string | undefined,
  opts?: { maxLines?: number; intervalMs?: number }
): (line: string) => void {
  if (!installId) return () => {};
  const maxLines = opts?.maxLines ?? 8;
  const intervalMs = opts?.intervalMs ?? 800;
  let tail: string[] = [];
  let lastEmit = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    lastEmit = Date.now();
    emitProgress(installId, { bootLines: [...tail] });
  };
  return (line: string) => {
    const clean = line.trim().slice(0, 200);
    if (!clean || clean === tail[tail.length - 1]) return;
    tail.push(clean);
    if (tail.length > maxLines) tail.shift();
    if (timer) return;
    const wait = Math.max(0, intervalMs - (Date.now() - lastEmit));
    timer = setTimeout(flush, wait);
  };
}

/** Test seam: drop all sessions. */
export function resetProgress(): void {
  Array.from(sessions.values()).forEach((session) => {
    if (session.endTimer) clearTimeout(session.endTimer);
  });
  sessions.clear();
}
