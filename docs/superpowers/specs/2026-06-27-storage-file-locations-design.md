# Design: Make Server File Locations Discoverable

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Scope:** Discoverability only — surface where data already lives. No change to the storage layout or source of truth.

## Problem

GameVault (packaged as "RealmSwap") already stores all writable data under a single
well-defined root computed by `dataRoot()` in `src/lib/appPaths.ts`:

- `realmswap.db` — SQLite holding server definitions, config, and metadata (the source of truth)
- `local-servers/<serverId>/` — actual game server files (worlds, etc.)
- `local-backups/<serverId>/` — world backups
- `snapshots/<snapshotId>/` — full server-state snapshots
- `steamcmd/` — SteamCMD install
- `backups/` — pre-migration database backups

The data location is well-defined, but **no UI exposes it**. There is no Settings/About
page and no "open folder" affordance anywhere. If the app goes down, or a user wants to
back up / relocate / host their server outside the app, they have no way to discover where
their files live.

This work makes those locations **obvious and one-click reachable** in the UI. It does **not**
change the storage layout, and it does **not** export definitions out of the database
(the DB remains the single source of truth).

## Goals

- A global page that lists every key storage location with copy + open-folder actions.
- A per-server "open folder" action so a user can jump straight to one server's files.
- Plain-language reassurance that this folder *is* their data and can be backed up / moved.

## Non-Goals

- No change to `dataRoot()` or the on-disk layout.
- No export of server definitions/config to human-readable files (explicitly out of scope —
  the SQLite DB stays the source of truth).
- No Electron IPC bridge / preload changes (renderer stays HTTP-only).
- No disaster-recovery export/import bundle.

## Architecture

The renderer deliberately talks only to the local HTTP (Next.js) server — `preload.js` is
intentionally empty and exposes no Node APIs. The Next server process *does* have Node and
the `GAMEVAULT_DATA_DIR` environment variable, so all filesystem work happens there via new
API routes.

### API routes

**`GET /api/system/storage`**
Returns the locations for display. Shape:

```jsonc
{
  "dataRoot": "C:\\Users\\jimmy\\AppData\\Roaming\\RealmSwap",
  "locations": [
    { "key": "dataRoot",  "label": "Data folder", "path": "...",            "exists": true },
    { "key": "database",  "label": "Database",    "path": ".../realmswap.db","exists": true },
    { "key": "servers",   "label": "Servers",     "path": ".../local-servers","exists": true },
    { "key": "backups",   "label": "Backups",     "path": ".../local-backups","exists": false },
    { "key": "snapshots", "label": "Snapshots",   "path": ".../snapshots",   "exists": false },
    { "key": "steamcmd",  "label": "SteamCMD",    "path": ".../steamcmd",    "exists": true }
  ]
}
```

`exists` drives whether the Open button is enabled. Paths are computed from `dataRoot()` so
this route stays in sync with the rest of the app automatically.

**`POST /api/system/open-folder`**
Opens a folder in the OS file manager. Body is **one of**:

- `{ "target": "<whitelisted key>" }` — one of the keys above, OR
- `{ "serverId": "<id>" }` — opens that server's local directory.

The path is **always resolved server-side** — from the whitelist map (`resolveStorageTarget`)
or from the server record (looked up in the DB): use its `localPath` when set, otherwise
fall back to the computed `local-servers/<serverId>` directory (the existing
`getLocalServerDir` logic). The client never supplies a raw path. Before spawning, the resolved path is asserted to be inside `dataRoot()`; anything
outside is rejected (`400`). For the `database` key, the *containing folder* is opened
(can't "open" a file as a folder). Returns `{ ok: true }` or `{ ok: false, error }`.

### Pure helpers (unit-tested)

- `resolveStorageTarget(key: string): string | null` — maps a whitelist key to its absolute
  path (built on `dataRoot()`); returns `null` for unknown keys.
- `openFolderCommand(platform: NodeJS.Platform, path: string): { cmd: string; args: string[] }`
  — `win32 → explorer`, `darwin → open`, default → `xdg-open`. Tested without spawning.

The open-folder route composes these: resolve → validate inside `dataRoot()` → `openFolderCommand`
→ `spawn`.

## UI

### Global — new page `/dashboard/storage`

New component `StorageView.tsx`, reached from a new sidebar nav entry **"File Locations"**
(Lucide `HardDrive` icon). The page:

1. Fetches `GET /api/system/storage` on load.
2. Shows a short plain-language blurb:
   > "All your servers, worlds, and backups live in this folder. If the app ever stops
   > working, your data is safe here — copy this folder to back it up or move it to another
   > machine."
3. Renders one row per location: label, the path (monospace), a **Copy** button
   (`navigator.clipboard`, matching the existing copy pattern in `DashboardView`), and an
   **Open folder** button that POSTs `{ target: key }`. The Open button is disabled with a
   tooltip ("Created when first used") when `exists` is false.

### Per-server — "Open folder" action

Add an **"Open folder"** button next to the existing **Export** link on each server card in
`DashboardView`, and on the single-server `ConsoleView` page. It POSTs `{ serverId }`.

Visibility rule: shown only for **local** servers that have a `localPath`; hidden for cloud
servers (no local files). On spawn failure, surface an inline error / toast.

### Shared nav constant (targeted cleanup)

The sidebar nav-links array is currently copy-pasted across ~10 view components. Adding the
new "File Locations" entry to each copy is error-prone, so extract the links to a single
shared constant/module (e.g. `src/components/dashboardNav.ts` or similar) and have the views
consume it. This is a focused change justified by adding the nav item — not a broader refactor.
The `active` flag per page is preserved (each view marks its own entry active).

## Error Handling

- **Folder doesn't exist yet** → Open button disabled + tooltip; never attempt to open a
  missing path.
- **Spawn failure** (file manager not found, OS error) → route returns `{ ok: false, error }`;
  UI shows an inline error/toast.
- **Path outside `dataRoot()`** or unknown `target` → `400`, no spawn.
- **Cloud server / no `localPath`** → no per-server button rendered.

## Testing

- Vitest unit tests for `resolveStorageTarget` (correct path per key; `null` for unknown key;
  rejects traversal-style keys) and `openFolderCommand` (correct cmd/args for `win32`,
  `darwin`, fallback).
- Optional route-level test for `POST /api/system/open-folder` asserting it rejects
  out-of-root paths and unknown targets without spawning (mock the spawn).
- Manual smoke test: launch the packaged/dev Electron app, open `/dashboard/storage`, verify
  paths are correct, Copy works, and Open launches Explorer to the right folder; verify a
  local server's per-server Open button works and cloud servers show none.

## Key Files

| Concern | File |
|---|---|
| Data root (source of truth) | `src/lib/appPaths.ts` |
| New: storage info route | `src/app/api/system/storage/route.ts` |
| New: open-folder route | `src/app/api/system/open-folder/route.ts` |
| New: pure helpers | e.g. `src/lib/storageLocations.ts` (`resolveStorageTarget`, `openFolderCommand`) |
| New: global page | `src/app/dashboard/storage/page.tsx` + `src/components/StorageView.tsx` |
| Per-server button | `src/components/DashboardView.tsx`, `src/components/ConsoleView.tsx` |
| Shared nav constant | new module consumed by all `src/components/*View.tsx` |
| Server local dir resolution | `src/lib/runners/LocalWindowsRunner.ts` (existing `getLocalServerDir`) |
