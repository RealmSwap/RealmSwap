# Container Runtime (DockerRunner) — Design

**Date:** 2026-06-27
**Status:** Approved design, pending implementation plan
**Branch:** `worktree-feature+docker-runner`

## Goal

Make game servers runnable inside Docker containers as a real, selectable runtime
alongside the existing `LocalWindowsRunner`. This serves two motivations:

1. **Cross-platform hosting** — escape the Windows-only `LocalWindowsRunner` /
   SteamCMD-on-Windows assumptions by running the Linux dedicated-server build
   inside a Linux container.
2. **Remote-host readiness** — architect every Docker call to flow through a
   single configurable connection seam so pointing at a remote daemon later is a
   config change, not a rewrite. (Remote *management UI* is explicitly out of
   scope for this iteration.)

The current `DockerRunner` (`src/lib/runners/DockerRunner.ts`) is a non-functional
stub: it launches `ubuntu:22.04 sleep infinity`, ignores the game definition, and
throws on `update`. It is also unreachable — `runnerType` is hardcoded to `"LOCAL"`
at every server-creation site. This design replaces the stub with a full-lifecycle
implementation and wires up a per-server runtime toggle.

## Guiding principle: maximum reuse

The `ServerRunner` interface seam already exists, and every API route resolves its
runner via `getRunner(server.runnerType)`. This is therefore **not a new
subsystem** — it is a second full implementation of an existing interface, plus a
data-driven `container` spec block and a UI toggle.

The container runner mirrors the local runner's externally observable contract so
the UI behaves identically regardless of runtime:

- status transitions `STARTING → RUNNING` (and `CRASHED`) emitted on
  `serverEventBus`
- live CPU/memory stats via the existing `processMonitor` → `stats_update` SSE
- file-based console logs streamed by the existing `logTailer` SSE route
- graceful stop, SteamCMD-based update, and crash auto-restart

Key reuse leverage points discovered in the codebase:

- `processMonitor.startMonitoring(server)` already calls
  `getRunner(server.runnerType).getStats(server)` on an interval and emits SSE.
  Implementing `DockerRunner.getStats` lights up live stats with **zero** changes
  to the monitor.
- The logs SSE route (`api/servers/[id]/logs/stream`) tails a per-server
  `server.log` file via `streamServerLog`. If the container runner appends
  `docker logs -f` output into that **same** file, the only change needed is to
  include `DOCKER` in the route's runtime check.
- `planConfigFiles` / `writeStrategyConfig` write config to a host directory.
  Bind-mounting that host directory into the container means the **existing config
  writers work unchanged**.

## Data model: the `container` spec block

Extend `GameDefinitionSpec` in `src/lib/definitions/types.ts` with an **optional**
block:

```ts
export interface ContainerSpec {
  image?: string;                 // default: generic SteamCMD base image (see below)
  executable: string;             // Linux server binary, e.g. "valheim_server.x86_64"
  args?: ArgSpec[];               // reuses existing ArgSpec (string | {value,includeWhen})
  env?: Record<string, string>;   // extra env vars inside the container
  installSubDir?: string;         // defaults to the steamcmd install.installSubDir
}

export interface GameDefinitionSpec {
  // ...existing fields...
  container?: ContainerSpec;
}
```

Notes:

- **No database migration.** This lives inside the JSON `spec` column consumed by
  `parseSpec`. `runnerType` is already a `String` column (default `"CLOUD"`), so
  persisting `"DOCKER"` also needs no migration.
- **Docker is only offered when a definition declares `container`.** This naturally
  gates out games with no native Linux dedicated server (e.g. Enshrouded), which
  remain local-only.
- A new pure plan function `planContainer(spec, ctx)` (next to `planLaunch` in
  `src/lib/definitions/plan.ts`) resolves the block against the server context,
  applying `includeWhen` arg filtering exactly like `planLaunch`.

### Base image

The generic default image is **`cm2network/steamcmd`** (the de-facto, most-pulled
community SteamCMD base image). Individual definitions may override via
`container.image`. The image provides `steamcmd` on PATH; the runner supplies the
app id and launch command at runtime, so a single base image serves all SteamCMD
games.

## DockerRunner lifecycle

Per server: container name `realmswap-server-<id>`; host data dir
`<dataRoot>/local-servers/<id>` bind-mounted to `/data` inside the container.
Reusing the same `local-servers/<id>` path means config writers and the
`server.log` file location are shared between runtimes.

### `docker(args)` connection wrapper

A single internal helper builds and execs `docker <args>`, injecting connection
configuration (`DOCKER_HOST` / context) from env (and, later, a setting). v1
defaults to the local daemon. **Every** Docker invocation in the runner goes
through this helper — it is the remote-host seam.

### Shared log helpers

Factor the `server.log` helpers (`serverLogFile` / `appendLog` / `clearLogs`)
currently private to `LocalWindowsRunner` into a small shared module
(e.g. `src/lib/serverLogs.ts`) so both runners write the same file format.

### Tracked child processes

A `globalThis`-backed map (mirroring `localProcesses`) tracks per-server helper
processes — the `docker logs -f` follower and the `docker wait` exit-watcher — so
they survive Next.js dev hot-reloads and can be cleaned up on stop.

### start (and implicit install)

1. Set status `STARTING`, emit event.
2. Ensure host data dir exists; run `planConfigFiles` + `writeStrategyConfig` to
   write configs onto the host bind-mount path.
3. `docker rm -f <name>` any stale container (idempotent start).
4. `docker run -d --name <name> -v <hostDir>:/data -p <host>:<container>/<proto>…`
   (ports from `planPorts`) using `container.image`, with an entrypoint shell
   command of the form:
   ```
   steamcmd +force_install_dir /data/<subdir> +login anonymous \
     +app_update <appId> validate +quit \
     && cd /data/<subdir> && exec ./<executable> <args>
   ```
5. Start the `docker logs -f` follower → append into `server.log`.
6. Drive the existing download-progress UI by parsing follower output with the
   existing `parseSteamProgress` / `setProgress` helpers (SteamCMD download happens
   inside the container).
7. Begin readiness detection and `startMonitoring(server)`.
8. Start the `docker wait` exit-watcher for crash handling.

### readiness

Reuse the local runner's approach adapted for containers: poll the **published
host TCP port** for acceptance and/or match `launch.readyPattern` against follower
output; on success update status to `RUNNING` and emit `status_update`. Keep the
5-minute fallback timeout.

### stats

`docker stats <name> --no-stream --format "{{.CPUPerc}},{{.MemUsage}}"`, parsed
into `ProcessStats { cpuPercent, memoryMB }` with correct KiB/MiB/GiB unit
handling (fixing the stub's naïve parsing). Returns zeros when the container is
absent. `processMonitor` consumes this unchanged.

### logs

`getLogs` returns the tail of `server.log` (same as local). Live streaming is the
follower-into-`server.log` mechanism above; the SSE route is updated to treat
`DOCKER` like `LOCAL`.

### console input (sendCommand)

Best-effort parity with the local stdin write: the container is run with stdin
open and commands are delivered to the server process's stdin (attached stream or
`docker exec … > /proc/1/fd/0`). Documented as best-effort, since per-game console
protocols (e.g. RCON) vary — matching the local runner's own stdin-write behavior.

### stop

Mark the server in `intentionalStops`; if the definition has a
`launch.stdinStopCommand`, deliver it for a graceful shutdown, then `docker stop`
(SIGTERM with Docker's own timeout → SIGKILL). Tear down the follower/watcher,
clear monitoring, set status `STOPPED`.

### update

Re-run SteamCMD `app_update <appId> validate` for the server's container (via a
transient `docker run`/`exec` against the data volume), reusing the
`UPDATING → STOPPED` status flow and progress parsing.

### crash auto-restart

The `docker wait <name>` watcher resolves with the container exit code when it
stops. Route that exit through the **existing** `crashPolicy` helpers
(`isCrashExit`, `evaluateCrash`, `CRASH_MAX_RETRIES`) and the `intentionalStops`
set — identical semantics to the local runner, including the bounded auto-restart
and `CRASHED` terminal state.

## Connection abstraction + availability detection

- `docker(args)` wrapper (above) is the single point that reads `DOCKER_HOST` /
  context. v1: local daemon by default; remote = set the env/setting.
- New `GET /api/system/docker-status` route runs `docker version` (or `info`) via
  the wrapper and returns `{ available: boolean }`. Cheap, no auth-sensitive data.

## UI: per-server runtime toggle

- `CreateServerView` gains a **Runtime** choice (Local PC vs Docker). The Docker
  option is enabled only when (a) `docker-status` reports available **and** (b) the
  selected game's definition has a `container` block; otherwise it is shown
  disabled with a short explanation.
- The `servers` POST route (`src/app/api/servers/route.ts`) stops hardcoding
  `runnerType = "LOCAL"` and persists the user's choice. Other creation sites
  (archive restore, realm import) remain `"LOCAL"` for now.

## Testing

Unit tests with Vitest, mirroring the existing `src/lib/definitions/__tests__`
style, exercising the **pure** pieces with no real daemon:

- `planContainer(spec, ctx)` — executable/args/env resolution, `includeWhen`
  filtering, `installSubDir` defaulting.
- The `docker run` argument builder — correct `-v`, `-p host:container/proto`
  (from `planPorts`), `--name`, image, and entrypoint command string.
- `docker stats` output parsing — KiB/MiB/GiB → MB, CPU percent, empty/absent
  container.

The exec wrapper is abstracted (injectable) so these tests assert on the **command
that would be run** rather than invoking Docker. Real end-to-end container boot is
manual verification (see Rollout).

## Rollout / scope of this branch

1. Land the engine, `DockerRunner`, `docker-status`, UI toggle, shared log
   helpers, and tests with **Valheim** seeded with a `container` block, verified
   end-to-end against a local Docker daemon.
2. If Valheim works, seed `container` blocks for the other built-ins that ship
   Linux dedicated servers — Project Zomboid, ARK, Terraria, Palworld, Rust — as a
   fast follow **in the same branch**.

### Out of scope (deferred)

- Remote-host management UI, host pools/placement, and connection secrets storage.
- Wine/Proton for Windows-only games (e.g. Enshrouded) — these stay local-only.
- Per-game community images (e.g. `itzg/minecraft`) — the generic SteamCMD image
  is the v1 strategy.
- `docker cp` / volume-push config delivery for remote daemons without a shared
  filesystem — v1 relies on the host bind mount (local daemon).

## Risks / open notes

- **Host bind-mount accessibility:** Docker Desktop on Windows must have file
  sharing enabled for the data drive. If unavailable, surface a clear error; a
  named-volume + `docker cp` fallback is the documented future path.
- **Per-platform SteamCMD build:** SteamCMD inside a Linux container downloads the
  Linux build for the app id; only games with a native Linux dedicated server are
  eligible (enforced by the presence of a `container` block).
- **Port exposure for external play:** container ports are published to the host;
  router-level UPnP (reusing `mapPort`) can be applied to the host ports for
  external reachability, consistent with the local runner.
