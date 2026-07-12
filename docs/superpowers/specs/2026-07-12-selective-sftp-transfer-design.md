# Selective SFTP Transfer — Design

**Date:** 2026-07-12
**Status:** Approved (pending spec review)

## Problem

The Cloud transfer (Push/Pull) is a full mirror of the server's local directory
against the host's `remoteBasePath`. For most games the bulk of that tree is the
base server install (binaries, redistributables, engine content) that already
ships with the host's plan. Uploading it every time is slow and pointless — the
user only cares about their **world save** (and sometimes config).

## Goal

Let the user choose exactly which files transfer, defaulting to the game's
world-save data, and remember the choice per server. Apply the same selection to
both Push (upload) and Pull (download).

## Non-Goals

- No change to the credential/auth flow (covered by the prior fix).
- No per-file diffing UI beyond checkbox selection; the existing size+mtime skip
  in `planTransfer` still decides what is actually copied within the selection.
- No cross-game "smart detection" of saves beyond the built-in per-game defaults.

## UX

Clicking **Push to Cloud** or **Pull from Cloud** no longer transfers
immediately. It opens a **file-picker step** inside
`CloudAdvisorModal` showing a folder tree with tri-state checkboxes:

- **Push** renders the **local** server tree.
- **Pull** renders the **remote** host tree (so the user selects against the
  files that actually exist on the host and they map to the correct locations).

Initial checked state:
- **Recognized game with in-tree saves** → pre-checked to that game's world-save
  set.
- **Recognized game whose saves live outside the server dir** (e.g. Valheim,
  which saves under the Windows user profile) → nothing pre-checked; the user
  selects manually.
- **Unknown / custom game** → everything checked (preserves today's full-mirror
  behavior; nothing is silently dropped).

If the user has a saved selection for the server, that is used instead of the
default. The user adjusts, clicks **Continue**, and the transfer runs against the
selection.

The old **"Don't overwrite host config"** checkbox is removed — config files
(e.g. `server.properties`, `PalWorldSettings.ini`) simply appear in the tree and
can be unchecked.

## Per-Game World-Save Defaults

New pure module `src/lib/hosting/worldSaveDefaults.ts`:

```ts
// Returns POSIX paths, relative to the server's transfer base (localRoot /
// remoteBasePath), that hold a game's world-save data. Empty array => no known
// in-tree save location (caller decides fallback).
export function worldSaveDefaults(game: string): string[]
```

Initial mapping (mirrors the knowledge in `src/lib/backupPaths.ts`, but
base-relative and adds Palworld):

| Game        | Default include path(s)                                  |
|-------------|----------------------------------------------------------|
| PALWORLD    | `palworld-server/Pal/Saved/SaveGames`                    |
| MINECRAFT   | `world`                                                  |
| ENSHROUDED  | `enshrouded-server/savegame`                             |
| ARK         | `ark-server/ShooterGame/Saved/SavedArksLocal`            |
| ZOMBOID     | `zomboid-server/zomboid-data/Saves`                      |
| VALHEIM     | `[]` (saves live under the user profile, not in-tree)    |
| _default_   | `[]` (unknown → caller falls back to "everything")       |

`worldSaveDefaults` is unit-tested against these expectations. It is intended to
stay conceptually in sync with `backupPaths.ts`; a comment in each file
cross-references the other.

## Data Model

`ServerHostLink`:
- **Add** `includePaths String?` — JSON-encoded array of POSIX relPaths.
  `null` or `[]` means **full mirror** (back-compat: existing links keep working
  unchanged).
- **Remove** `excludeConfig Boolean` — folded into the picker.

Prisma migration performs both the add and the drop. On SQLite, Prisma rebuilds
the table; the dropped boolean is a lost preference only, no user data.

## Sync Engine

`planTransfer(source, dest, ignore, include?)` gains an optional `include`
parameter (array of POSIX relPaths):

- If `include` is undefined or empty → include everything (current behavior).
- Otherwise a source entry is included when its relPath **equals** an included
  path **or** is **under** one (`relPath === p || relPath.startsWith(p + "/")`).
- `ignore` (`DEFAULT_IGNORE`) still applies **on top** of the include filter, so
  `logs/`, `cache/`, `**/session.lock`, etc. never sync even if a parent folder
  is checked. `DEFAULT_IGNORE` is the always-applied hard floor.

Semantics of "checking a folder": the folder's relPath is stored in
`includePaths`; every current and future file beneath it is transferred. This is
why persistence is by include-path rather than exact file list — new save files
created later are picked up automatically.

Parent-directory creation for deeply-nested included files is already handled by
the `Transferer.copy` implementations (push: `sftp.put` mkdirs recursively;
pull: `fs.mkdirSync(recursive)`), so include-filtering files alone is safe.

`executeTransfer` drops the `excludeConfig` branch and passes `include` through:

```ts
const plan = planTransfer(source, dest, DEFAULT_IGNORE, ctx.include);
```

## API & Data Flow

### New: `GET /api/servers/[id]/transfer/tree?direction=PUSH|PULL`

Owner-only (same guards as the transfer route). Returns:

```ts
{
  tree: FileEntry[],        // walk of the relevant side
  includePaths: string[],   // persisted selection ([] if none)
  defaultPaths: string[],   // world-save default for this game ([] if none/unknown)
  unknownGame: boolean      // true => UI defaults to "all checked"
}
```

- **PUSH** → `walkLocal(localRoot)`. No credentials needed.
- **PULL** → `provider.createClient(...)` with `decryptSecret(link.secret)`,
  `connect()` (bounded 20 s timeout from the prior fix), `walkRemote(remoteBase)`,
  `end()` in `finally`. Connection errors surface as a 502-style JSON error the
  picker shows inline.

### Changed: host-link `PUT`

Accepts and persists `includePaths` (validated to be an array of strings);
`excludeConfig` handling removed.

### Changed: `transfer` route

Reads `link.includePaths` (JSON-parsed, defaulting to `[]`) and threads it into
`executeTransfer` as `include`.

## UI Components

- **`FilePickerTree`** (`src/components/dashboard/advisor/FilePickerTree.tsx`):
  a controlled tri-state checkbox tree built from `FileEntry[]`. Props: the flat
  entry list, the set of checked include-paths, and an `onChange`. Internally it
  nests the flat POSIX relPaths into a tree, renders expandable folders, and
  maps checkbox state to/from the include-path set (checking a folder collapses
  its subtree selection to the single folder path; a partially-checked folder
  shows the indeterminate state). Purely presentational — no data fetching.

- **`CloudAdvisorModal`** gains a `SELECT_FILES` sub-state in the TRANSFER step:
  1. User clicks Push/Pull.
  2. Ensure the host link is saved (auto-save if dirty — reuses the prior fix;
     for Pull this also validates credentials).
  3. `GET …/transfer/tree?direction=…`; on error, show it and stop.
  4. Render `FilePickerTree` seeded with `includePaths` (or `defaultPaths`, or
     all-checked when `unknownGame`).
  5. **Continue** → `PUT` the selection as `includePaths` → run the existing
     `transfer(direction)`.
  6. **Back** returns to the connection form without transferring.

  The "Don't overwrite host config" checkbox is removed from the form.

## Error Handling

- Pull-tree connection failure → inline error in the picker; no partial state
  saved.
- Empty selection (nothing checked) → **Continue** disabled with a hint
  ("Select at least one file"), preventing a no-op transfer.
- Existing per-file transfer failures still collect into `TransferSummary.failures`
  unchanged.

## Testing

- **Engine (`syncEngine.test.ts`)**: include filter — folder-prefix inclusion,
  exact-file inclusion, `include=[]` means all, include combined with
  `DEFAULT_IGNORE` (ignored junk excluded even under a checked parent).
- **Defaults (`worldSaveDefaults.test.ts`)**: each known game resolves to the
  expected relPaths; unknown → `[]`.
- **Tree route**: unit/integration for direction routing and the JSON shape
  (remote path mocked via the injectable `SftpClient`).
- **UI (`FilePickerTree`, modal)**: verified by `tsc` + `next build` and manual
  walkthrough; the repo has no jsdom/RTL harness, so no automated component test
  is added (noted as a follow-up).

## Rollout / Back-Compat

- Existing links have `includePaths = null` → full mirror, identical to today
  until the user opens the picker and narrows the selection.
- `excludeConfig` removal is behavior-visible only to users who had it on; they
  now uncheck config in the picker instead. Called out in the PR description.
