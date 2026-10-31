# API e2e harness (Layer 1 — zero-human test plan)

Boots the **production** Next server on `:3100` against a throwaway SQLite DB
and data dir, with a **local fake Supabase** in place of the real project, then
drives real flows end-to-end: the app's actual `/api/auth/*` routes, session
cookies, game-server processes, filesystem moves, and ports.

```bash
npm run e2e:api          # @smoke — every PR (~5-10 min; CI runs this on ubuntu)
npm run e2e:api:heavy    # + @heavy scenarios (real installs) — nightly
```

## Why this is zero-human and CI-safe

- **No Supabase**: `scripts/e2e-api/fakeSupabase.ts` implements the GoTrue
  surface the app uses (password sign-in, signup, user read/update, logout,
  recovery, permissive `/rest/v1/*`). Access tokens are real HS256 JWTs signed
  with the `SUPABASE_JWT_SECRET` the app runs under, so the app verifies them
  through its documented offline path (`src/lib/supabase/verifyLocal.ts`) —
  the same code that keeps the dashboard working with no internet. Bad
  passwords are rejected, so the 401 path stays covered.
- **No dev-server interference**: the build goes to `.next-e2e` (a
  `next.config.mjs` `distDir` override via `NEXT_DIST_DIR`), so a running
  `:3000` dev server is never clobbered, and `next start` has no dev-server
  project lock to fight over. The DB is `prisma/e2e-api.db`.
- **Throwaway state**: `prisma/e2e-api.db` and the data dir's
  `local-servers/`/`local-archives/` are wiped per run; `runtimes/` survives so
  the Temurin JRE provisioning (and later SteamCMD) is paid once.

## What the smoke scenarios prove today

- **auth/session-lifecycle** — unauthenticated 401s, bad-password 401, login
  through the real route (Set-Cookie session from the ssr client), first local
  user mirrored as ADMIN, second account via real `/api/auth/register`,
  `update-password` rotation (old stops working), neutral reset-password,
  logout clearing the session.
- **mc/server-lifecycle** — Minecraft definition seeded, server created, real
  boot: STARTING → **RUNNING only when port 25565 truly accepts** → live query
  ping → console command → server.log shows the boot `Done (…)` line and the
  command output → SSE log stream delivers → stats/telemetry/disk/players/
  network-status/crashes/sessions/progress respond → restart → stop (port
  closes) → SIGKILL mid-boot lands CRASHED, never RUNNING → archive moves the
  dir into the vault → restore brings it back → a non-member gets 403 on the
  owner's secrets.
- **mods/search-install-lifecycle** — live Modrinth search; a loader-dependent
  mod on vanilla and a client-only mod are both refused with the app's real
  messages; the fabric loader installs and passes its boot test; a pinned
  Modrinth mod installs with the **required-dependency BFS** (fabric-api row +
  jar alongside) while install progress streams over the real SSE endpoint;
  config get/put round-trips a real TOML (with `.bak`); enable/disable renames
  the jar on disk; `updates` sees the pinned-old build and `update-all` applies
  the newer one through a boot test; export → import round-trips a collection;
  uninstall removes row + jar; reconcile syncs disk↔rows both ways; a broken
  pack upload dies in the preflight with a 400; every STOPPED-only mutation
  400s while the server is RUNNING; a non-member gets 403.

- **surface/server-surface** — config round-trip (file written under the
  server dir), settings render-now while stopped + validation + POST actions,
  the honest "blocked" connectivity report for a stopped server, status-share
  enable/rotate/disable with the **unauthenticated public `/s/<code>` page**
  (no player/address leaks, `no-store`), the Minecraft SteamCMD update
  refusal, atomic world import, log-archive list/read with a seeded rotated
  zip, the offline cloud advisor (score 40 / STAY_LOCAL for vanilla MC), and
  the `servers/stream` SSE heartbeat.
- **surface/membership-players** — collaborator CRUD with the ADMIN/MODERATOR/
  VIEWER ladder (owner-only management, role changes, revoke), host-link
  shape-only validation + encrypted secret + honest dead-endpoint test,
  transfer PUSH/PULL failing against a closed local port (lastError
  persisted), the global players book (cross-user 404s, global ban + audit
  row, `banned-players.json` written by sync), custom definition lifecycle
  (admin-only custom scripts, slug collisions, 409 while referenced), and the
  RCON routes (stopped refusal, RUNNING-without-credentials null contract).
- **backups/s3-lifecycle** — snapshot create refuses a worldless server,
  creates a verified zip under `local-backups/<serverId>/`, verify catches
  corrupted bytes and enforces the Minecraft `level.dat` sentinel, restore
  refuses corrupt zips and RUNNING servers but atomically swaps a good one,
  retention pruning deletes rows + zips, backup/archive deletes, the two
  storage surfaces (per-server analytics + system location map), and S3
  settings (hint-only reads, honest dead-endpoint test).
- **realmsync/host-client-sync** — the invite route starts the real host
  listener on :3001 (public IP + UPnP attempt), the harness then acts as the
  client: verifies the HMAC-signed manifest directly against the listener,
  joins through `/api/client/sync` with a non-loopback host (the SSRF guard
  refuses loopback), streams the SSE progress to `done`, receives the config
  payload on disk, and revokes the invite (listener closes, re-join fails).
- **marketplace/realms-roundtrip** — export streams a real `.realm` tar
  (validated to contain `realm.json` with no secrets), `realms/validate`
  consumes the exact bytes, `realms/import` creates the "(Imported)" server
  with extracted files; over the fake Supabase's PostgREST surface the full
  marketplace chain runs for real: publish (with secret scrubbing) → list →
  mine → versions → favorite toggle → deploy (creates a local server and
  writes the payload's config overrides) → version history.
- **agents/nodes-lifecycle** — the harness plays the node over the real HMAC
  protocol: admin mints an enrollment token, register is single-use, every
  sync auth failure mode is explicit (bad headers/signature/timestamp,
  protocol mismatch), the node claims **BACKUP_CREATE** and **BACKUP_RESTORE**
  commands from the real dashboard flows, uploads a tar through the
  path-signed upload endpoint, downloads through a one-shot token (pinning
  the route's sign-without-query contract), reports results that complete the
  dashboard's blocked request, drives agent-reported server status, and
  revocation kills the handshake. Server assignment is a documented DB
  fixture (no builtin definition ships a container plan).
- **ops/user-system** — admin egg import (role gate, parse errors, real
  import, slug collision), automations CRUD + validation + manual execute
  (fire-and-forget with observable SUCCESS/FAILED executions), user
  preferences (persisted) vs settings (guarded no-op), Discord link codes
  seeded directly (single use, expiry, collision, 15-min rate limit),
  web-push vapid provisioning + subscription dedupe, the billing kill-switch
  (flat 404 even unauthenticated), system metrics/docker-status, and the
  internal-token shutdown (stops services, not the app — asserted).

## What the heavy scenarios prove (nightly / `npm run e2e:api:heavy`)

- **ops/bot-actions** — the Discord bot's action route with `BOT_API_SECRET`
  set: wrong-bearer 401, unsupported action 400, unknown server 404, then the
  real thing — bot `start` boots Minecraft to RUNNING and bot `stop` shuts it
  down, both through the same path the bot uses.

- **mods/loader-matrix** — fabric, quilt, and forge each install on their own
  fresh server and pass the post-install boot test (the launch path is
  exactly what real Start runs). NeoForge is asserted as the honest refusal
  it currently is: every NeoForge build for this Minecraft (26.2) is a beta,
  so the route answers "No NeoForge build is available…"; this flips to a
  real install once a stable build ships.
- **mods/pack-pipeline** — the crown jewel: install-pack with a **pinned
  Adrenaline .mrpack** (live Modrinth resolution → download → preflight →
  pack-pinned fabric loader → ~20 server files installed → 11 client-only
  files skipped → boot test), then re-importing the **previous pack version**
  proves `retireReplacedPackMods` removes the mods that left the manifest,
  update-pack's imported-pack refusal is asserted, and a crafted crash-jar
  dropped into `mods/` is **blamed and quarantined** by the boot test while a
  real mod installs. The packed server then boots to RUNNING and answers the
  live status ping.
- **mods/curseforge-pack** — CurseForge install-pack (numeric project id,
  newest-compatible file resolution) + update-pack's "already on the newest
  pack file" path. Self-skips when the app has no `CURSEFORGE_API_KEY`, so CI
  without the secret stays green; local runs with `.env` exercise it.

The first run downloads the Minecraft `server.jar` (~55 MB) and provisions a
Temurin JRE for the host platform (a side effect of the platform-aware
`ensureJava`: mac/linux hosts now provision real runtimes instead of failing on
Windows-only paths — that fix is what makes real boots possible on this
machine and in CI at all).

## Route ledger (drift guard)

`routes-ledger.json` maps **every** API route on disk to its coverage status:
`covered` (scenario ids), `planned` (with a note), or `manual`. The vitest test
`src/app/api/__tests__/routeLedger.test.ts` fails CI when a route ships
without an entry, an entry goes stale, or a `covered` entry claims a scenario
the harness doesn't define — so "every functionality is covered" can't rot as
the app grows. Current baseline: **134 covered / 1 manual** (the one manual
route spawns the OS file manager and belongs to the GUI layer). The only
deliberately uncovered surfaces: real SteamCMD installs (Windows/CI-only —
Layer 3), live UPnP/tunnels on real hardware (Layer 4), and real Discord /
Stripe / S3 traffic (residual human list in the zero-human test plan).

## Environment knobs

| Variable | Default | Purpose |
|---|---|---|
| `E2E_API_PORT` | `3100` | App under test port |
| `E2E_API_DATA_DIR` | `/tmp/realmswap-e2e-api-data` | Throwaway data dir |
| `E2E_API_REBUILD` | off | Force a fresh `next build` |
| `E2E_API_BOOT_TIMEOUT_MS` | `480000` | Game-server boot budget (first run downloads) |
| `E2E_FAKE_SUPABASE_PORT` | `3199` | Fake Supabase port |
| `E2E_API_DIST_DIR` | `.next-e2e` | Isolated build output |

A machine-readable report lands at
`$E2E_API_DATA_DIR/e2e-api-report.json` (CI uploads it as an artifact).
