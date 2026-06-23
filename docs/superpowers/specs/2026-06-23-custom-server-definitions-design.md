# Custom Server Definitions — Design

**Date:** 2026-06-23
**Status:** Approved (design); ready for implementation planning

## Problem

GameVault supports exactly 8 games (Minecraft, Valheim, Enshrouded, Zomboid, ARK, Terraria, Palworld, Rust). Every game is **hardcoded** and its data/behavior is scattered across at least six locations:

- `src/components/CreateServerView.tsx` — `AVAILABLE_GAMES` catalog array (name, icon, color, desc, recRam).
- `src/lib/localRunner.ts` — `getGameSteamInfo()` (App ID / subdir / check file), a per-game disk-requirement switch, a giant per-game `startLocalServer` switch (~80 lines/game of install + config-write + spawn logic), and per-game UPnP port maps.
- `src/app/api/servers/route.ts` — default-port `if` chain.
- `src/app/api/servers/[id]/config/route.ts` — per-game editable-config-file path switch.

There is no game-definition table, no registry, and no way for a user to add a game the app doesn't already know. Adding one game today means editing all six places.

## Goal

Let users define their own game server definitions for games we don't ship, while unifying the existing built-ins onto the same definition format. Three creation modes via tabs so casual users stay simple and power users get full control:

1. **SteamCMD** — install via a Steam App ID (covers 7 of 8 current games).
2. **Download** — install from an arbitrary download URL (covers Minecraft's `server.jar`).
3. **Custom Script** — fully arbitrary install/launch commands (power users; **admin-only**).

## Decisions (from brainstorming)

- **Scope:** All three install modes, surfaced as three tabs.
- **Built-ins:** Unify everything onto one definition schema + one launch engine. Ship the 8 built-ins as pre-packaged definitions seeded on first install (and idempotently refreshed for existing installs).
- **Ownership:** Custom definitions are **per-user private**. Built-ins are global/shared.
- **Settings model:** Fixed common fields (name, RAM, password, port) **plus** definition-declared typed custom params rendered as a dynamic form. Both feed templates.
- **Arbitrary tab:** Warn + acknowledge + **admin-only**. Requires a new `User.role` field (no instance-level admin role exists today).

## Data Model

### New model: `GameDefinition`

| Field | Type | Purpose |
|---|---|---|
| `id` | cuid | PK |
| `slug` | String | stable key (e.g. `MINECRAFT`, `my-factorio`); replaces today's `game` string |
| `displayName` | String | catalog name |
| `icon` | String | emoji/icon |
| `color` | String | Tailwind classes for the catalog card |
| `description` | String | short description |
| `recommendedRamGB` | Float | sizing hint (today's `recRam`) |
| `requiredDiskGB` | Float | disk pre-check (today's disk switch) |
| `ownerId` | String? | `null` = built-in/global; set = per-user private |
| `isBuiltIn` | Boolean | protects pre-packaged defs from edit/delete |
| `installMethod` | String | `STEAMCMD` \| `DOWNLOAD` \| `CUSTOM_SCRIPT` |
| `spec` | Json | rich structure (below) |
| `createdAt` / `updatedAt` | DateTime | timestamps |

Uniqueness: slug is unique **per owner** (built-ins under `ownerId = null`, customs namespaced to their owner) to avoid collisions between a built-in slug and a user's custom slug.

### `spec` JSON shape

```jsonc
{
  "install": {
    // STEAMCMD:
    "appId": "896660", "installSubDir": "valheim-server", "checkFile": "valheim_server.exe"
    // DOWNLOAD:     { "url": "...", "fileName": "server.jar", "checkFile": "server.jar", "unzip": false }
    // CUSTOM_SCRIPT:{ "installScript": "..." }
  },
  "launch": {
    "executable": "valheim_server.exe",
    "args": ["-nographics", "-batchmode", "-port", "{port}", "-password", "{password}"]
    // CUSTOM_SCRIPT: { "launchScript": "..." } instead of executable/args
  },
  "params": [
    { "key": "difficulty", "label": "Difficulty", "type": "enum",
      "options": ["easy", "normal", "hard"], "default": "normal", "required": false }
    // types: text | number | boolean | enum; number supports min/max
  ],
  "configFiles": [
    { "path": "server.properties", "template": "max-players={maxPlayers}\nmotd={name}\n" }
  ],
  "editableConfigPath": "server.properties",
  "ports": [
    { "protocol": "UDP", "port": "{port}" },
    { "protocol": "UDP", "port": "2457" }
  ]
}
```

**Template variables** available to `launch.args`, `configFiles[].template`, `launch.env`, and `ports[].port`:
- Fixed fields: `{name}`, `{password}`, `{port}`, `{ram}`.
- Plus every declared custom param `key`.

### `Server` model changes

- `definitionId String?` — FK to `GameDefinition`. `game` string is retained for display/back-compat and backfilled to the resolved slug.
- `paramValues Json?` — this instance's chosen values for the definition's custom params.

### `User` model change

- `role String @default("USER")` — values `USER` | `ADMIN`. Gates the `CUSTOM_SCRIPT` install method.
- **First registered user is auto-promoted to `ADMIN`.** In `POST /api/auth/register` (the existing `prisma.$transaction` at `src/app/api/auth/register/route.ts:34`), count users inside the transaction; if this is the first (`count === 0`), create with `role: "ADMIN"`, otherwise `"USER"`. The count + create stay in the same transaction to avoid a race on concurrent first registrations.
- **Pre-release migration:** since the app is not released yet, the migration that adds `role` backfills **all existing accounts to `ADMIN`** (not the `USER` default). Achieved by setting the column default to `ADMIN` for the backfill, then leaving the schema default as `USER` for future registrations — or an explicit `UPDATE User SET role = 'ADMIN'` data migration step. New non-first registrations get `USER`.

## Launch Engine

Replace the per-game `switch` blocks with a data-driven engine (refactor of `src/lib/localRunner.ts`, optionally a new `src/lib/definitionRunner.ts`).

1. **`renderTemplate(str, context)`** — interpolates `{var}` from a context built once per launch (fixed fields + `paramValues`). Unknown variable → error, surfaced at **definition-save validation** time, not launch time. No shell evaluation.

2. **`installFromDefinition(def, server)`** — switch on `installMethod`:
   - `STEAMCMD` → reuse existing SteamCMD logic, parameterized from `spec.install` (App ID, disk check, `checkFile` verification).
   - `DOWNLOAD` → fetch `url` → `fileName`, optional unzip, verify `checkFile` (generalizes Minecraft `server.jar`).
   - `CUSTOM_SCRIPT` → run `installScript` (admin-gated; warning acknowledged).

3. **`writeConfigFiles(def, ctx)`** — render + write each `configFiles` entry pre-launch (generalizes EULA / `server.properties` / `enshrouded_server.json` / `.ini` writers).

4. **`buildAndSpawn(def, ctx)`** — render `launch.args` (or run `launchScript`), spawn the executable as an **argv array** (no shell concatenation), capture `pid`.

5. **`mapUpnpPorts(def, server)`** — render `spec.ports`, feed existing UPnP add/remove helpers.

The default-port logic (`servers/route.ts`) and editable-config-path logic (`[id]/config/route.ts`) both collapse into reading the definition.

## API

- `GET /api/definitions` — built-in (global) + caller's private definitions (for the catalog).
- `POST /api/definitions` — create custom. Server-side validation (below). `CUSTOM_SCRIPT` rejected unless `user.role === "ADMIN"`.
- `PUT /api/definitions/[id]` / `DELETE /api/definitions/[id]` — edit/delete own only; `isBuiltIn` defs are read-only.
- `GET/POST /api/servers` + launch path resolve a `definitionId` instead of switching on a `game` string.

**Validation on save:** required fields per install method; every `{var}` in args/config/ports/env resolves to a known fixed field or declared param; port templates render to valid port numbers.

## UI

1. **Catalog** (`CreateServerView.tsx`) — replace hardcoded `AVAILABLE_GAMES` with a fetch of `/api/definitions`. Built-ins and customs share one grid (customs visually tagged); add a **"+ Custom Game"** card.
2. **Definition editor** — three-tab form:
   - **SteamCMD** — App ID, install subdir, check file, executable, launch args, ports.
   - **Download** — URL, filename, unzip toggle, check file, executable, args, ports.
   - **Custom Script** — install + launch scripts; **admin-only**; warning ("scripts run with the app's privileges on this host") + explicit acknowledgement checkbox required before save.
   - All tabs share the **params builder** (typed fields) and **config-file template** editors.
3. **Dynamic param form** — on the create-server step, render fields from the chosen definition's `params` (text/number/bool/enum, defaults, validation) → `Server.paramValues`.

## Built-in Seeding

- Author the 8 built-ins as definition specs in one source file: `prisma/builtinDefinitions.ts`.
- **Idempotent upsert keyed by `slug`**, run by both `prisma/seed.js` (fresh installs) and on app startup (existing installs receive/refresh built-ins without touching user data).
- Built-ins: `ownerId = null`, `isBuiltIn = true`.

## Migration

- Backfill each existing `Server.definitionId` by matching its `game` string to the seeded built-in `slug`.
- Backfill all existing `User.role` to `ADMIN` (pre-release; see `User` model change). New registrations follow the first-user rule: first user → `ADMIN`, the rest → `USER`.

## Security

- `CUSTOM_SCRIPT` is admin-only at **both** layers: API rejects non-admins; UI hides the tab.
- No shell evaluation in template rendering — args spawn as an argv array, so param values can't inject commands. The Custom Script tab is the one explicit, acknowledged exception.
- Definition validation (see API) blocks unresolved variables and malformed specs at save time.

## Testing

- **Unit:** `renderTemplate` (vars, missing vars, escaping); spec validation; param-value validation.
- **Regression (primary safety net):** for each of the 8 built-ins, assert the engine produces the exact install target, argv, config-file contents, and UPnP port list that the current hardcoded code produces. De-risks "unify everything."
- **Integration:** create → install → launch → stop for one STEAMCMD and one DOWNLOAD definition.

## Edge Cases

- Deleting a definition with live servers → block (or soft-handle) rather than orphan running servers.
- Built-in slug vs user custom slug collision → slugs unique per owner.
- Upgrading a built-in spec while servers exist → servers store enough to relaunch; spec changes apply on next start.

## Out of Scope (this pass)

- Sharing custom definitions between users (per-user private only for now).
- Sandboxing custom scripts (warn + admin-only is the chosen posture).
- Migrating the `game` string column away entirely (kept for back-compat/display).
