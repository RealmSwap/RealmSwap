# GUI e2e harness (Layer 2 of the zero-human test plan)

Drives the **real Electron app** — the actual window, React UI, preload IPC
bridge, and (packaged pass) the packaged boot chain — over Playwright's
`_electron` CDP bridge. Complements the API harness (`scripts/e2e-api`), which
covers every HTTP route but never opens a window.

## What runs

### Dev pass — `npm run e2e:gui` (~4 min warm)

Reuses the API harness's boot chain: throwaway DB, fake Supabase, `next start`
on :3100 (isolated `.next-e2e` build). The Electron **dev** binary is pointed
at it through `GAMEVAULT_DEV_URL`, so the developer's :3000 dev server is never
touched. Scenarios (`--tag smoke`):

| Scenario | Proves |
|---|---|
| `gui/auth-and-shell` | login form (bad creds → exact inline error; good → dashboard), every sidebar page renders its heading, billing-disabled redirect |
| `gui/server-lifecycle` | first-server wizard → **real Minecraft boot to Online** → live SSE console + a real `list` command → Join Info modal → `POST /api/system/open-folder` via the card's **Files** button (the ledger's GUI-owned route) → clean stop to Offline |
| `gui/settings-and-ipc` | settings sections render; the ONLY preload bridge (`window.realmswapDesktop` launch-on-boot pair) round-trips through IPC; dev builds honestly report `supported:false` and the card says so |
| `gui/close-to-tray-and-quit` (last) | sign out through the UI; window close **hides to tray** (app keeps running); File → Quit (the tray's own code path: `beginQuit` → `before-quit` → stopAllServers) exits cleanly |

`npm run e2e:gui:heavy` adds `gui/mods-install-progress`: a real Modrinth
search + install driven through ModsView with the SSE `InstallProgressPanel`
reaching `Done` (live network; nightly).

### Packaged mac pass — `npm run e2e:gui:packaged` (~10 min)

Builds the real mac bundle (`electron-builder --dir`, unsigned, with the fake
Supabase URL + dummy `packaged-env.json` provider keys baked in) and boots it
exactly like an installed copy, isolated from real user data via
`GAMEVAULT_USER_DATA_DIR`:

1. `startup.log` must contain `startup: packaged launch`, `provider keys from
   package: CURSEFORGE_API_KEY, STEAM_API_KEY`, `migrations applied: […]`, and
   `server ready on port N` — and no `STARTUP ERROR`.
2. The in-process standalone server answers `/start` on the logged port.
3. Real UI login; the Dedicated Box launch-on-boot toggle round-trips through
   IPC with `supported:true` (toggles the real OS login item, restores it off).
4. File → Quit exits the process cleanly.

Notes:

- mac-only here on purpose — the Windows packaged surface (installer, NSIS,
  auto-update, tunnel) is the CI smoke workflow (plan layer 3).
- `next build` for the bundle writes the **shared `.next` dir**: kill the :3000
  dev-server tree first (build-vs-dev protocol), or set `E2E_GUI_KILL_DEV=1` to
  have the harness do it, or `E2E_GUI_SKIP_BUILD=1` to reuse an existing
  `dist/mac-<arch>/RealmSwap.app`. After a build, restart the dev server with
  `rm -rf .next/cache && nohup npm run dev > /tmp/rs-dev.log &`.
- The Files-button check opens a real Finder window on macOS — that's the
  route's job.

## Product knobs added for harnessability (electron/main.js)

- `GAMEVAULT_DEV_URL` — dev-mode window URL override (default stays
  `http://localhost:3000`).
- `GAMEVAULT_USER_DATA_DIR` — relocates userData (DB, startup.log, backups) so
  packaged checks never touch a real install.
- `GAMEVAULT_TEST_HARNESS=1` — skips `realmsync://` protocol registration so
  harness launches don't steal the OS handler.
- Prisma query-engine path is now platform-aware (was hardcoded
  `query-engine-windows.exe`, which would break any non-Windows packaged
  build's migrations and API).

## Reports

`/tmp/realmswap-e2e-api-data/e2e-gui-report.json` (same data dir as the API
harness) + `*-failure.png` screenshots on failure.
