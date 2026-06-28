# Server Transfer to Hosting Provider — Design

**Date:** 2026-06-27
**Status:** Approved (pending spec review)

## Summary

Add the ability to transfer a RealmSwap server's files **both directions** between
the local install and a remote hosting provider over SFTP. The first supported
provider is **Akliz**. "Transfer" means a **full-server mirror** — world saves,
config files, and mods/plugins — so the remote and local installs match as
closely as possible.

The design introduces a provider abstraction (`HostingProvider`) so additional
hosts can be added later, a per-server stored connection (`ServerHostLink`) with
the credentials encrypted at rest, and a directory sync engine that mirrors the
local server tree against the provider's SFTP file area.

## Background

RealmSwap is a local-first game server manager (Electron + Next.js standalone
server). Servers run locally via the `ServerRunner` abstraction
(`LocalWindowsRunner`). Relevant existing groundwork:

- **`.realm` export** (`src/app/api/servers/[id]/export/route.ts`) already
  packages a server's files + a `realm.json` manifest (mods, scheduled tasks,
  params) into a gzipped tarball, and stops a running server before reading
  files.
- **Backup service** (`src/lib/backupService.ts`, `src/lib/backupPaths.ts`)
  locates per-game save directories. For Minecraft the local install root is
  `local-servers/<serverId>/` with the world at `local-servers/<serverId>/world`.
- **Per-server progress + SSE** (`src/lib/downloadProgress.ts`) provides a
  `setProgress(serverId, …)` / `getProgress` / `clearProgress` store that the
  dashboard already consumes to render per-server progress bars
  (`progressMap[server.id]` in `src/components/DashboardView.tsx`).
- **Packaged DB migrations** (`electron/migrate.js` + `migrations/`) apply schema
  changes to the user's live database on startup.

### Akliz transfer mechanism (researched)

Akliz exposes server files via **SFTP** (per their help docs):

- **Host:** an SFTP hostname shown in the Akliz Command Center per server
  (`Manage → Show SFTP Information`), e.g. `bos-sr-1-1-1.akliz.net` — *not* the
  game server IP.
- **Port:** 22.
- **Username:** the account email followed by `.<digits>`, e.g.
  `user@email.com.123`.
- **Password:** the Command Center **login** password (sensitive).
- SFTP is file transfer only — it **cannot** start/stop the remote server or run
  remote commands. Akliz advises stopping the server before modifying files.

For a Minecraft server, the Akliz SFTP root mirrors RealmSwap's local
`local-servers/<serverId>/` layout closely (server.jar, server.properties,
`world/`, plugins/mods), which makes a whole-tree mirror tractable.

## First target

**Minecraft.** Chosen because both sides are a flat, file-based layout (no deep
SteamCMD nesting), Akliz's Minecraft layout is well documented, and RealmSwap
downloads the JAR directly into `local-servers/<serverId>/`. The provider
abstraction does not hard-code Minecraft, but Minecraft is what v1 is built and
tested against.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Transfer mechanism | SFTP | What Akliz exposes |
| Direction | Two-way (push and pull) | User requirement |
| Data set | Full server (world + config + mods) | User requirement |
| Mapping strategy | Whole-tree mirror of `local-servers/<id>/` ↔ remote base path | Avoids fragile per-file/per-game mapping |
| Incrementality | Skip unchanged files by size + mtime | Cheap, no remote hashing |
| Deletes | None in v1 (additive/overwrite only) | Mirror-with-delete is the dangerous part; deferred |
| Credential storage | Store all (host, port, user, password), encrypted at rest | User choice |
| Encryption | Electron `safeStorage` (packaged) / AES-256-GCM keyfile (dev) | Standalone server runs in-process with Electron in packaged builds, bare Node in dev |
| Remote stop enforcement | Confirmation checkbox only | SFTP can't stop the remote server |

## Architecture

### 1. Data model

New one-to-one Prisma model (additive; requires a migration following the
existing packaged-migration system):

```prisma
model ServerHostLink {
  id             String    @id @default(cuid())
  serverId       String    @unique
  server         Server    @relation(fields: [serverId], references: [id], onDelete: Cascade)
  provider       String    @default("AKLIZ")   // future: other hosts
  host           String                          // Akliz SFTP host from Command Center
  port           Int       @default(22)
  username       String                          // e.g. user@email.com.123
  secret         String                          // encrypted password blob (tagged base64)
  remoteBasePath String    @default(".")          // SFTP root for the server's files
  excludeConfig  Boolean   @default(false)        // safety valve: skip host-specific config files
  lastPushAt     DateTime?
  lastPullAt     DateTime?
  lastError      String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

Add `hostLink ServerHostLink?` to the `Server` model.

### 2. Provider + SFTP layer (`src/lib/hosting/`)

- **`types.ts`**
  - `SftpClient` interface — `connect`, `list`, `mkdir`, `put`, `get`, `stat`,
    `end`. The sync engine depends only on this interface so tests can inject a
    fake and the real library is swappable.
  - `HostingProvider` interface — `id`, `displayName`, `testConnection(creds)`,
    and a factory that builds a connected `SftpClient` from credentials plus
    remote-path semantics.
  - `HostCredentials` type — `{ host, port, username, password, remoteBasePath }`.
- **`aklizProvider.ts`** — first `HostingProvider`. Validates Akliz-shaped
  credentials and supplies the default remote base path.
- **`sftpClient.ts`** — adapter wrapping the new dependency
  **`ssh2-sftp-client`** to the `SftpClient` interface.
- **`registry.ts`** — maps provider id → `HostingProvider` (only `AKLIZ` in v1).

New dependency: `ssh2-sftp-client`.

### 3. Encryption (`src/lib/hosting/secretStore.ts`)

`encryptSecret(plain): string` / `decryptSecret(blob): string`, with the blob
self-describing its scheme via a tag prefix:

- **Packaged (Electron in-process):** if `require("electron").safeStorage` is
  available and `isEncryptionAvailable()`, use it (DPAPI-backed on Windows).
  Blob tagged `v1:safe:<base64>`.
- **Dev / no Electron:** AES-256-GCM with a one-time random 32-byte key persisted
  to a locked-down keyfile under `dataRoot` (created on first use). Blob tagged
  `v1:aes:<base64(iv|tag|ciphertext)>`.

`decryptSecret` dispatches on the tag, so a record written in one environment
still decrypts in that same environment. The encrypted secret is never returned
to the client; the API field is write-only.

### 4. Sync engine + ignore rules (`src/lib/hosting/syncEngine.ts`)

Split into a pure planner and an executor:

- **`planTransfer(direction, localListing, remoteListing, ignore)`** — pure.
  Returns ordered operations (dirs to create, files to transfer). Skips ignored
  paths and skips files unchanged by **size + modified-time** comparison. Listings
  are injected, so it is unit-tested without a network or filesystem.
- **`runTransfer(plan, sftpClient, hooks)`** — executes operations, reporting
  count-based percent through `hooks.onProgress`, wired to
  `setProgress(serverId, …)` / `clearProgress(serverId)` so the dashboard bar
  lights up via the existing SSE stream.

**Direction semantics:**

- **PUSH** — walk local `local-servers/<id>/`, ensure remote dirs, upload
  changed/new files.
- **PULL** — walk the remote base path, ensure local dirs, download changed/new
  files.

**Default ignore list:** `logs/`, `crash-reports/`, `**/session.lock`, `cache/`,
`realm.json`, and the secret keyfile. When `excludeConfig` is on, also skip
host-specific config files (e.g. `server.properties`).

**No deletes in v1** — additive/overwrite only. True mirror-with-delete is a
noted future option.

### 5. API routes (`src/app/api/servers/[id]/…`)

All routes are scoped to a server owned by the authenticated user, matching the
existing route auth pattern.

- **`GET host-link`** — returns config **without** the secret (host, port,
  username, provider, remoteBasePath, excludeConfig, lastPushAt, lastPullAt,
  lastError).
- **`PUT host-link`** — create/update. Password is only re-encrypted when
  supplied, so editing the host doesn't require re-entering it.
- **`DELETE host-link`** — unlink.
- **`POST host-link/test`** — connect and list the remote base path; returns ok
  or a friendly error.
- **`POST transfer`** — body `{ direction: "PUSH" | "PULL", confirmRemoteStopped:
  boolean }`. Guards: auto-stops the **local** server first (same as export
  route), and requires `confirmRemoteStopped`. Runs the engine, updates
  `lastPushAt` / `lastPullAt` / `lastError`, returns a summary (files
  transferred, bytes, failures).

Progress is consumed through the existing per-server progress store/SSE — the
transfer route just calls `setProgress` / `clearProgress`.

### 6. UI (`src/components/`)

- New **"Transfer / Host"** action button (cloud-upload icon) on each server card
  in `DashboardView.tsx`, beside the existing Export `.realm` button.
- New **`HostTransferModal`** component:
  - Connection form — provider (Akliz, fixed), host, port (22), username,
    password, remote base path (`.`), exclude-config toggle. Field-help tooltips
    (reusing the existing field-help pattern) point to where Akliz shows SFTP
    info in Command Center. **Test Connection** button.
  - **Push to Akliz** / **Pull from Akliz** buttons, each gated behind a required
    checkbox: *"I've stopped the server in Akliz Command Center."*
  - Shows last push / last pull timestamps and any `lastError`.
  - Live progress via the same `progressMap[server.id]` the card already renders.
  - Inline warnings: stop both sides first; full-mirror overwrites remote/local
    config.

### 7. Safety & error handling

- Local server is auto-stopped before transfer (mirrors export-route behavior).
- Remote stop can't be enforced over SFTP → confirmation checkbox only.
- Per-file failures are collected, not fatal; **nothing is deleted**. The summary
  reports failures and `lastError` is persisted.
- Connect is wrapped with a timeout so a bad host doesn't hang.
- Credentials never leave the server; the secret field is write-only.

## Testing (vitest, matching `src/lib/__tests__/`)

- **`planTransfer`** — pure tests: ignore rules, skip-unchanged (size+mtime),
  PUSH vs PULL direction, nested directories, `excludeConfig`.
- **`runTransfer`** — end-to-end against an in-memory fake `SftpClient`,
  asserting the correct puts/gets/mkdirs and progress callbacks.
- **`secretStore`** — encrypt→decrypt round-trip on the AES fallback path
  (safeStorage isn't available under vitest) and tag dispatch.
- **`aklizProvider`** — credential validation.

The real `ssh2-sftp-client` adapter is a thin pass-through, left to manual
verification against the live Akliz instance.

## Out of scope (v1)

- Mirror-with-delete (removing remote/local files absent on the other side).
- Hosting providers other than Akliz.
- Scheduled / automatic sync (transfers are manual, user-triggered).
- Remote start/stop control (not possible over SFTP).
- Content-hash–based incremental diffing.
