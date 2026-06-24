# Live Server Console / Log Tailing — Design

**Issue:** [#6 Live server console / log tailing in the UI](https://github.com/codyrmills28/GameVault/issues/6)
**Date:** 2026-06-24
**Status:** Approved for planning

## Summary

GameVault captures every local server's stdout/stderr to a `server.log` file but the
UI can only poll a static snapshot every 2 seconds. This work adds a real **live tail**:
a Server-Sent Events (SSE) stream of new log output, consumed by an upgraded console
modal with auto-scroll, pause, and search.

## Scope

In scope (issue #6 core):
- Capture and stream a local server's combined log output to the UI in real time.
- Live-tail console view with auto-scroll, pause/resume, and search/filter.
- Establishes the SSE transport pattern (partial foundation for issue #5).

Out of scope (deferred to follow-ups):
- Command input / RCON / stdin passthrough (issue #6 stretch goal — separate issue).
- Migrating the existing stats/progress polling to SSE (issue #5 proper).

## Key Decisions

1. **Transport: SSE** (one-way server→client). Fits log tailing, native to the Next.js
   App Router via `ReadableStream`, no new dependencies. WebSocket was rejected as
   heavier than needed for a read-only stream.
2. **Source: file-tailing, not child-process hooking.** The runner writes *two* kinds of
   content to the same `server.log`: the child process's piped stdout/stderr
   (`localRunner.ts` ~661–663) **and** the runner's own `appendLog()` lines (readiness
   checks, crash detection, SteamCMD output). Tailing the file captures both and stays
   decoupled from the spawn internals. Hooking only `child.stdout` would miss the runner
   messages.
3. **Scope: logs only.** Command input deferred.
4. **Pause semantics:** Pause freezes the rendered view while the stream keeps buffering
   underneath; a "N new lines" badge shows pending output; Resume flushes and jumps to
   bottom.

## Architecture

Three isolated units:

### 1. `src/lib/logTailer.ts` (new)

A standalone, unit-testable file-tailing engine.

```
streamServerLog(serverId: string, opts: { signal: AbortSignal; tailLines?: number })
  => AsyncIterable<string>
```

Behavior:
- Resolves the log path `dataRoot()/local-servers/<serverId>/server.log` (same path
  `getLocalServerLogs` already uses).
- First yields an **initial snapshot**: the last `tailLines` (default 200) lines of the
  file. Records the current byte offset (end of file).
- Then watches for appends using `fs.watch` for `change` events **plus** a ~1s `fs.stat`
  poll as a fallback (Windows `fs.watch` is unreliable). On growth, reads bytes
  `offset → newSize`, advances the offset, and yields the decoded UTF-8 text.
- **Partial-line buffering:** a read may end mid-line; the trailing partial line is held
  and prepended to the next read so consumers always receive whole lines.
- **Truncation:** if the file size is smaller than the offset, reset offset to 0 and
  re-snapshot (defensive — the runner appends, so this is rare).
- **Missing file:** if the log doesn't exist yet, yield a friendly placeholder snapshot
  and keep watching the directory for the file to appear.
- **Cleanup:** on `signal` abort, close the watcher and clear the poll timer.

What it depends on: `fs`, `path`, `dataRoot()`. No DB, no process map — pure I/O.

### 2. `src/app/api/servers/[id]/logs/stream/route.ts` (new SSE endpoint)

- `export const runtime = "nodejs"` (needs `fs`), `export const dynamic = "force-dynamic"`.
- `GET` handler. Auth identical to the existing logs route: `getAuthenticatedUser()` →
  401, then `verifyServerAccess(serverId, user.id)` → 404. (`EventSource` sends the
  `gv_session` cookie automatically, same-origin.)
- Returns a `Response` wrapping a `ReadableStream` with headers:
  `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`,
  `Connection: keep-alive`.
- **LOCAL servers:** iterate `streamServerLog(...)`, framing each chunk as an SSE
  `data:` event (one `data:` line per log line, blank line terminator). Emit a `: ping`
  heartbeat comment every ~15s to keep the connection alive.
- **CLOUD servers:** send the existing mock snapshot (reuse the strings from the current
  logs route) once as a `data:` event, then heartbeats. Keeps the UI consistent even
  though no live source exists.
- Tie tailer cleanup to `req.signal` abort (client disconnect / modal close).
- On tailer error: send an SSE `event: error` with a message, then close the stream.

A pure helper `formatSseEvent(payload: string, opts?): string` (line-framing + escaping)
is extracted so it can be unit-tested without a live stream.

### 3. `src/components/DashboardView.tsx` (modify console modal)

Replace the existing 2s polling effect (lines ~93–116) with an `EventSource`.

State (per active console):
- `consoleLines: string[]` — buffered lines, capped at ~5000 (drop oldest beyond cap to
  bound memory).
- `paused: boolean`, `pendingCount: number` (lines buffered while paused),
  `search: string`, `connState: "live" | "connecting" | "error"`.

Behavior:
- On modal open: `new EventSource(/api/servers/<id>/logs/stream)`. `onmessage` appends
  parsed lines; `onerror` sets `connState = "connecting"` (EventSource auto-reconnects);
  `onopen` sets `"live"`. Close the source on modal close / effect cleanup.
- **Auto-scroll:** keep the view pinned to the bottom on new lines; if the user scrolls
  up, stop auto-scrolling; when they scroll back to the bottom, resume.
- **Pause/Resume:** while paused, new lines accumulate in the buffer but the rendered
  view is frozen; a badge shows `pendingCount`. Resume re-renders and jumps to bottom.
- **Search:** a text input filters the rendered lines (case-insensitive substring).
- Footer: replace the hardcoded "(2s polling)" note with a live `connState` indicator.

The existing `GET /api/servers/[id]/logs` route is left untouched (no longer used by the
modal, but harmless and avoids scope creep).

## Data Flow

```
game server process ──stdout/stderr──┐
runner appendLog() ──────────────────┴─▶ server.log (disk)
                                             │  fs.watch + stat poll
                                             ▼
                                    logTailer.streamServerLog()
                                             │  async iterable of lines
                                             ▼
                              SSE route (text/event-stream)
                                             │  data: <line>\n\n
                                             ▼
                              EventSource in console modal
                                             │
                                    consoleLines[] → filter/pause/auto-scroll → <pre>
```

## Error Handling

- **Tailer:** missing file → placeholder snapshot + keep watching; read/watch error →
  surfaced to the SSE route which emits `event: error` and closes.
- **SSE route:** auth failures return JSON 401/404 (not a stream). Runtime errors emit an
  SSE error event then close so the client can show a message.
- **UI:** `EventSource` auto-reconnects on transient drops; `connState` reflects
  live/connecting/error. Buffer cap prevents unbounded memory growth on chatty servers.

## Testing

TDD with Vitest (existing harness). Focus on the pure, isolatable logic:

- **`logTailer` unit tests** (temp dir + short poll interval):
  - Initial snapshot returns the last N lines of an existing file.
  - Appended content is detected and yielded incrementally.
  - A write split mid-line across two appends yields whole lines (partial-line buffering).
  - File truncation resets the offset and re-snapshots.
  - Missing file yields a placeholder and then picks up content once created.
  - Abort signal stops iteration and clears watchers/timers.
- **`formatSseEvent` unit tests:** multi-line payload → correctly framed `data:` lines
  with a terminating blank line; comment/heartbeat framing.

The SSE route (HTTP streaming) and the React modal interactions (auto-scroll, pause,
search) are integration-level and verified manually by running the app against a local
server.

## Files

| File | Change |
|------|--------|
| `src/lib/logTailer.ts` | new — file-tailing engine |
| `src/lib/logTailer.test.ts` | new — unit tests |
| `src/app/api/servers/[id]/logs/stream/route.ts` | new — SSE endpoint |
| `src/components/DashboardView.tsx` | modify — console modal: EventSource + auto-scroll/pause/search |
