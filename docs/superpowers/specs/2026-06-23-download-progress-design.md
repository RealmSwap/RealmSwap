# Design: Live download progress on the server card

**Date:** 2026-06-23
**Branch:** `feature/download-progress`
**Status:** Approved (design), pending spec review

## Problem

When a local server is `STARTING` (or `UPDATING`) and is installing/downloading its
binaries — either via SteamCMD or a direct HTTP download — the user gets no visual
feedback on how far along the download is. The dashboard card shows only a pulsing
`STARTING` badge. For multi-gigabyte SteamCMD installs this can look like the app is
hung. We want a live progress bar with a short phase label on the server card.

## Goals

- Show a live progress bar on each server's dashboard card while it is `STARTING` or
  `UPDATING` and downloading/installing.
- Report a real percentage during the actual download phases (SteamCMD app download and
  HTTP download); show an indeterminate (pulsing) bar with a descriptive label during
  phases that cannot produce a percentage (SteamCMD self-update, archive extraction,
  custom install scripts).
- No database schema change; no streaming infrastructure.

## Non-goals

- Resuming interrupted downloads (not supported by SteamCMD/HTTP flow today).
- Progress for the cloud (mock) runner — only `runnerType === "LOCAL"` does real installs.
- Persisting progress across an app restart (an interrupted install is not resumable).
- A progress indicator inside the console/logs panel (card only, by decision).

## Current behavior (as-is)

- `startLocalServer` ([src/lib/localRunner.ts](../../../src/lib/localRunner.ts)) sets
  status to `STARTING`, then installs via one of three methods:
  - **STEAMCMD** — `installSteamCmdApp` spawns `steamcmd.exe`; its stdout contains lines
    like `Update state (0x61) downloading, progress: 42.66 (123 / 456)`. These are written
    to `server.log` with a `[SteamCMD Status]` prefix but not parsed into a number.
  - **DOWNLOAD** — `downloadFile` uses `https.get` and pipes the response straight to a
    file. No progress tracking at all.
  - **CUSTOM_SCRIPT** — `runShellScript` runs a `.bat`/cmd script. No parseable progress.
- `updateGameServer` runs the same SteamCMD `app_update` path under status `UPDATING`.
- The frontend ([src/components/DashboardView.tsx](../../../src/components/DashboardView.tsx))
  polls `/api/servers` every 8s for status and renders a pulsing `STARTING` badge. Logs
  poll every 2s, but only while the per-server console panel is open.

## Architecture

Three pieces: an in-memory progress store module, runner wiring that feeds it, and a
polling endpoint the dashboard card reads.

### 1. Progress store — `src/lib/downloadProgress.ts` (new)

Isolated, dependency-free module so the parsing/percent logic is unit-testable without
the runner or network.

```ts
export interface ProgressState {
  phase: string;          // machine-ish phase key, e.g. "steam-download", "extract"
  percent: number | null; // 0..100, or null = indeterminate
  label: string;          // human label, e.g. "Downloading Valheim 42%"
  updatedAt: number;      // epoch ms (Date.now())
}
```

- A `globalThis`-backed `Map<serverId, ProgressState>` using the same hot-reload-safe
  pattern as `localProcesses` in the runner.
- Exports:
  - `setProgress(serverId, partial: Partial<ProgressState>)` — merges into existing entry
    (or creates one), stamps `updatedAt`.
  - `getProgress(serverId): ProgressState | null`
  - `clearProgress(serverId): void`
- Pure helpers (the primary unit-test targets):
  - `parseSteamProgress(line: string): number | null` — extracts the float after
    `progress:` (e.g. `42.66`); returns `null` when the line has no progress token.
  - `computePercent(received: number, total: number): number | null` — returns
    `received/total*100` clamped to `[0, 100]`; returns `null` when `total <= 0` or
    not finite.

### 2. Runner wiring — `src/lib/localRunner.ts`

`installSteamCmdApp` and `downloadFile` each gain an **optional** `onProgress?:
(p: { percent: number | null; label: string }) => void` parameter (mirrors the existing
`onLog` pattern), so the store is not imported into those low-level helpers and they stay
testable in isolation.

`startLocalServer` sets phase labels around each step and passes an `onProgress` that
writes to the store:

| Phase | percent | label |
|-------|---------|-------|
| SteamCMD setup (`setupSteamCMD`) | null | `Setting up SteamCMD…` |
| SteamCMD self-update (`ensureSteamCmdUpdated`) | null | `Updating SteamCMD…` |
| SteamCMD app download (`installSteamCmdApp`) | parsed | `Downloading {name} {pct}%` |
| HTTP download (`downloadFile`) | content-length based | `Downloading {name} {pct}%` |
| Archive extraction (Expand-Archive) | null | `Extracting…` |
| Custom install script | null | `Running install script…` |

- In `installSteamCmdApp`, the existing stdout handler additionally runs each line through
  `parseSteamProgress`; on a non-null result it calls `onProgress({ percent, label })`.
- In `downloadFile`, read `response.headers["content-length"]`; accumulate `data` chunk
  byte counts; call `onProgress` with `computePercent(received, total)` (throttled to at
  most ~4×/sec to avoid excessive calls). If there is no `content-length`, emit
  `percent: null` so the bar is indeterminate.
- `clearProgress(serverId)` is called once the child process is successfully spawned, and
  also in `handleProcessExit` (covers normal exit, crash, and the auto-restart path so a
  stale bar never lingers).
- The same wiring is added to `updateGameServer` for the `UPDATING` path (same SteamCMD
  helpers), with `clearProgress` in its success and error/`finally` handling.

### 3. Endpoint — `GET /api/servers/[id]/progress` (new)

`src/app/api/servers/[id]/progress/route.ts`, mirroring the auth pattern of the existing
logs route:
- `getAuthenticatedUser()` → 401 if missing.
- `verifyServerAccess(serverId, user.id)` → 404 if no access.
- Returns `{ status: server.status, progress: getProgress(serverId) }` where `progress`
  is the store entry or `null`. Returning `status` lets the card decide when to stop
  polling without a second request.

### 4. Frontend — `src/components/DashboardView.tsx`

- New state: `progressMap: Record<string, ProgressState | null>`.
- New `useEffect` that, while any server has status `STARTING` or `UPDATING`, polls
  `GET /api/servers/{id}/progress` for those servers on an interval (~1.5s) and updates
  `progressMap`. The interval clears itself when no server is in those states (and on
  unmount). Servers that are not starting/updating are not polled.
- Render: directly under the status badge block in the server card, when the server is
  `STARTING`/`UPDATING` and a progress entry exists, show:
  - the `label` text (e.g. `Downloading Valheim 42%` / `Extracting…`),
  - a thin track with a fill bar:
    - **determinate** (`percent != null`): fill width = `${percent}%`,
    - **indeterminate** (`percent == null`): an animated/pulsing bar (reuse the existing
      `animate-pulse` styling already used by the badge).
  - Styled with the existing purple/accent Tailwind classes used elsewhere in the card.
  - Hidden entirely when the server is not starting/updating or no progress exists.

## Data flow

```
steamcmd.exe stdout ─┐
                     ├─ onProgress ─→ setProgress(id, …) ─→ in-memory Map
https download bytes ─┘                                          │
                                        GET /api/servers/[id]/progress (poll ~1.5s)
                                                                  │
                                          DashboardView progressMap ─→ card progress bar
```

## Error handling / edge cases

- **Already installed** (`checkFile` exists): the download branch is skipped; no progress
  is ever set, status flips to `RUNNING` quickly, no bar shown.
- **No `content-length`** on an HTTP download: emit `percent: null` → indeterminate bar
  that still shows `Downloading…`.
- **Install failure**: `startLocalServer`/`updateGameServer` throw; `clearProgress` runs
  in the exit/finally handling so the bar is removed and the status badge reflects the
  failure (`CRASHED`/`STOPPED`).
- **Crash auto-restart**: `handleProcessExit` clears progress before a retry; the next
  `startLocalServer` run repopulates it.
- **Hot reload (dev)**: store survives via `globalThis`, same as `localProcesses`.
- **App restart mid-install**: store is empty on boot; bar simply doesn't show. Acceptable
  (install isn't resumable).

## Testing

Vitest unit tests next to the new module (`src/lib/__tests__/downloadProgress.test.ts`):
- `parseSteamProgress`: real SteamCMD progress lines (`Update state (0x61) downloading,
  progress: 42.66 (…)`), `100.00`, lines with no progress token, malformed input.
- `computePercent`: normal ratio, `total = 0` / negative / non-finite → `null`, overflow
  (`received > total`) clamps to `100`, rounding behavior.
- `setProgress`/`getProgress`/`clearProgress`: create, merge partial update, clear → null.

Manual verification: start a SteamCMD game (e.g. Valheim) and a direct-download game from
the dashboard and confirm the bar advances and disappears on completion.

## Out-of-scope / future

- Console-panel progress indicator.
- Byte/ETA display (MB downloaded, transfer rate, time remaining).
- Progress for custom-script installs beyond an indeterminate bar.
