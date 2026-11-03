/**
 * In-process progress hub for long-running mod operations (pack installs,
 * loader installs, boot verification). The install route emits stage/byte
 * events keyed by a client-generated installId; the SSE route relays them to
 * the Mod Manager's progress panel. Sessions are ephemeral: a bounded frame
 * history is kept and REPLAYED to late subscribers (a fast machine can finish
 * a whole small-pack install between the client's POST and its SSE connect —
 * catch-up of only the last frame made those installs look boot-only), and
 * everything is dropped shortly after the terminal event.
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
  /** Every frame this session emitted (bounded), replayed on subscribe. */
  history: ModProgressEvent[];
  startedAt: number;
  terminal: boolean;
  endTimer?: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, ProgressSession>();
/** Sessions end 10s after their terminal event so SSE clients can drain it. */
const END_GRACE_MS = 10_000;
/** Abandoned sessions (no terminal event — e.g. a crashed route) age out. */
const STALE_MS = 30 * 60_000;
/** Replay cap: boot-test label frames are throttled by the emitter, so this
 * comfortably covers even a long Minecraft boot. */
const HISTORY_MAX = 200;

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
    const initial: ModProgressEvent = { stage: "resolving" };
    sessions.set(installId, { subs: new Set(), last: initial, history: [initial], startedAt: Date.now(), terminal: false });
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
  if (session.history.length >= HISTORY_MAX) {
    session.history.shift();
  }
  session.history.push(session.last);
  for (const sub of Array.from(session.subs)) {
    try {
      sub(session.last);
    } catch {
      /* a broken subscriber must not break the install */
    }
  }
  return session.last;
}

/** Subscribe; replays the session's full frame history first (catch-up), then
 * delivers live frames. The session's initial state is always in the history,
 * so every subscriber sees at least one frame. */
export function subscribeProgress(installId: string, sub: Subscriber): (() => void) | null {
  const session = sessions.get(installId);
  if (!session) return null;
  const replay = [...session.history];
  session.subs.add(sub);
  try {
    for (const event of replay) {
      sub(event);
    }
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
