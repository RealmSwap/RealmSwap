# GameVault Desktop (Electron) — Design

Date: 2026-06-23
Status: Approved (pending spec review)
Scope: Wrap the existing Next.js + Node app as an installable Windows desktop app, plus desktop niceties. Auth unchanged.

## Goal

Ship GameVault/RealmSwap as a launchable, installable **Windows desktop application** with no behavioral changes to the existing feature set. The entire Node.js backend (child_process server orchestration, SteamCMD, Prisma/SQLite, nat-api/UPnP, process monitoring, backups) runs unchanged. Login/register/JWT auth is preserved as-is.

## Non-goals (this pass)

- Auto-update (electron-updater)
- Code signing / notarization
- macOS / Linux builds (app is Windows-only by design)
- Any auth changes
- Migration to Tauri or IPC-based backend

## Architecture

### Runtime model

Electron's **main process** boots the existing Next.js app as an **in-process production server**:

1. `app.whenReady()` → resolve a free `127.0.0.1` port.
2. Create a Next app handle (`next({ dev: false, dir: <app root> })`), `await app.prepare()`.
3. Start a minimal Node `http` server that delegates to Next's request handler, listening on the chosen port.
4. Create a `BrowserWindow` and load `http://127.0.0.1:<port>` once the server reports ready.

Rationale for in-process over spawning `next start`: single process to manage, deterministic "server ready" gate before showing the window, clean shutdown, and no detached-child port-collision handling.

The Node backend runs in the main process exactly as today — no API route changes, no IPC rewrite.

### Process / window lifecycle

- **Single-instance lock** via `app.requestSingleInstanceLock()`; a second launch focuses the existing window.
- **System tray** icon with a context menu: *Open GameVault*, *Quit*.
- **Minimize/close to tray:** the window's close button hides to tray rather than quitting, so running game servers keep running. A real quit happens only via tray → Quit or the app menu.
- **Native app menu:** File → Quit; View → Reload, Toggle DevTools; Help → About.
- **Graceful shutdown on quit:** before the app exits, stop all tracked game-server child processes (reuse `stopLocalServer` / `taskkill /F /T`) so SteamCMD and game-server processes are not orphaned.

## The path problem (core fix)

Today, data locations resolve off `process.cwd()` and a **relative** Prisma SQLite URL (`file:./dev.db`). In a packaged app the install directory (e.g. `Program Files`) is read-only and cwd is unreliable.

### `src/lib/appPaths.ts`

New module exposing a single writable data root:

- **Packaged:** value of `process.env.GAMEVAULT_DATA_DIR`, set by the Electron main process to `app.getPath('userData')` (e.g. `%APPDATA%\GameVault`).
- **Dev / non-packaged:** `process.cwd()` (preserves current behavior).

`dataRoot()` returns the directory; helper accessors (e.g. `localServersDir()`, `steamcmdDir()`, `dbPath()`) build paths under it.

### Call-site migration

Replace the `process.cwd()`-based data path construction in:

- `src/lib/localRunner.ts`
- `src/lib/backupService.ts`
- `src/app/api/servers/[id]/mods/install/route.ts`
- `src/app/api/servers/[id]/import-world/route.ts`
- `src/app/api/servers/[id]/config/route.ts`
- `src/app/api/servers/[id]/archive/route.ts`
- `src/app/api/archives/[id]/restore/route.ts`

(The matches in `src/generated/client/**` are Prisma-generated and are NOT edited.)

### Database

- Change the Prisma datasource URL to `env("DATABASE_URL")`.
- The Electron main process sets `DATABASE_URL=file:<dataRoot>/gamevault.db` before the Next server starts.
- **First-run setup:** the installer bundles a schema-applied, empty template DB in app resources. On launch, if `<dataRoot>/gamevault.db` is absent, copy the template into place. The app's existing built-in game-definition seeding (`src/lib/definitions/ensureSeeded.ts`) populates definitions on boot.
- This avoids running the Prisma CLI inside the packaged app. (Project is `db push`-only; no `prisma/migrations/` exists.)

## Packaging

- **electron-builder**, target **Windows NSIS x64**.
- Bundle: built `.next` output, runtime `node_modules`, the **Prisma query-engine binary** + generated client, the template DB, and a placeholder app icon.
- **`asarUnpack`** the Prisma native query engine and any binaries that must exist as real files on disk (classic Prisma-in-Electron gotcha).
- App/product metadata (name: GameVault, version from `package.json`).

## Dev workflow / scripts

- `npm run dev` — unchanged (Next dev at :3000, browser).
- `npm run electron:dev` — Next dev server + Electron window pointed at the dev server.
- `npm run electron:build` — `next build` → electron-builder → installer in `dist/`.

## File / module layout (new)

- `electron/main.js` (or `.ts`) — app lifecycle, in-process Next server bootstrap, window, tray, menu, single-instance, graceful shutdown.
- `electron/preload.js` — minimal preload (context isolation on; no Node exposure needed since UI talks to the local HTTP server).
- `src/lib/appPaths.ts` — writable data-root resolver + path helpers.
- `build/` resources — placeholder icon, template DB.

## Error handling

- Server-ready gate: if the in-process Next server fails to start, show an error dialog and quit (don't show a blank window).
- Port selection retries on `EADDRINUSE`.
- First-run DB copy failures surface a dialog with the target path.
- Graceful shutdown has a timeout; force-kill (`taskkill /F /T`) on timeout (mirrors existing `stopLocalServer` behavior).

## Testing

- **Unit (vitest):** `appPaths.ts` — dev branch returns cwd-based paths; packaged branch honors `GAMEVAULT_DATA_DIR`.
- **Regression:** existing vitest suite stays green (the path refactor is the main regression risk).
- **Manual smoke checklist:**
  1. Build installer, install fresh.
  2. Launch → register → log in.
  3. Create + start a server (verify install/download progress, UPnP).
  4. Minimize to tray; confirm server keeps running.
  5. Tray → Quit; confirm tracked servers are stopped (no orphan processes).
  6. Relaunch; confirm DB/data persisted under `%APPDATA%\GameVault`.

## Risks

- **Prisma engine packaging** — most likely failure point; mitigated by `asarUnpack` + smoke test.
- **Path refactor regressions** — mitigated by keeping the dev branch identical and unit-testing the resolver.
- **Orphaned processes on quit** — mitigated by the graceful-shutdown step.
