# Headless deployment (Docker on Linux)

Run the RealmSwap dashboard on a machine with no desktop — a NAS, mini PC,
Proxmox VM, or any Linux box with Docker. Game servers run as **sibling
containers on the same host** (docker-outside-of-docker), driven by the
dashboard through the mounted Docker socket.

## Requirements

- Docker Engine 20.10+ (Linux) or Docker Desktop — x86_64 or arm64
- A Supabase project for auth (same cloud services the desktop app uses —
  see [supabase-shared-services.md](supabase-shared-services.md))

## Quick start

```sh
cp compose.env.example .env      # fill in the values (comments explain each)
docker compose up -d --build
open http://<host>:3000          # first account becomes ADMIN
```

The dashboard container:

- keeps **all state** (SQLite DB, server files, backups, snapshots, secret
  keys) in the `./data` bind mount — back up that one folder
- applies pending SQLite migrations on every boot (`scripts/migrate-on-boot.js`,
  the same forward-only runner the packaged desktop app uses)
- needs the Docker socket mounted so `DockerRunner` can start/stop game
  containers as siblings; it never runs game servers inside itself

## Creating servers

Pick the **Docker** runtime in the create form (or let the first-server wizard
choose it when a Docker daemon is reachable). Games with container support:
**Valheim, Project Zomboid, ARK, Terraria, Palworld, Rust** — SteamCMD runs
inside each game container at boot, so installs/updates are automatic. Games
without container plans (Minecraft, Enshrouded, V Rising, Satisfactory,
Windrose) still need a Windows desktop install — their local-runner launch
paths are Windows-only today.

## Configuration reference

| Variable | Purpose |
| --- | --- |
| `GAMEVAULT_DATA_DIR` | App data inside the dashboard container (compose sets `/data`). |
| `GAMEVAULT_HOST_DATA_DIR` | **The same volume as seen by the host Docker daemon** (absolute path). Game containers bind-mount server dirs from here; if it doesn't match the `./data` mount, containers get empty dirs. |
| `GAMEVAULT_GAME_HOST` | Where the dashboard reaches published game ports for player queries + RCON. Compose sets `host.docker.internal` (resolved via `host-gateway`). |
| `DATABASE_URL` | SQLite file URL (`file:/data/realmswap.db`). |

Desktop/native runs need none of these — defaults preserve existing behavior.

## Notes & current limits

- **World persistence on Docker servers**: all container-plan games keep saves
  under the `/data` bind mount. Valheim's Unity layer would otherwise write
  worlds into the container's writable layer (destroyed on every start), so
  its container spec redirects `HOME` to `/data/valheim-data`; backups and
  restores target that path.
- **Mods on Docker-runner servers**: the mod system (Modrinth/CurseForge/
  Thunderstore/uMod/Workshop) is Windows-local-runner territory today — Zomboid
  workshop downloads are win32-gated in the mod layer. Headless + mods is
  planned agent work, not part of this deployment.
- **Discord bot**: runs as a separate process (`npm run bot`) and is not part
  of the container image yet.
- **UPnP/tunnels**: playit tunneling spawns an agent per server from the
  dashboard process — it works inside the container (linux-amd64 playit build),
  but on a NAS you typically port-forward directly instead.
- **Permissions**: the dashboard runs as root in the image so it can use the
  Docker socket and write the bind mount without UID gymnastics. If you
  harden this (dedicated user + `docker` group + matching volume ownership),
  game containers run as the `steam` user (uid 1000) and need write access to
  `local-servers/<id>`.
- **Rootless Docker**: mount the rootless socket path instead of
  `/var/run/docker.sock`.

## Shared storage (NAS mounts)

Server data can live on shared storage by pointing the data dirs at an
NFS/SMB mount:

- **Dashboard container**: bind-mount the mount into the container and set
  `GAMEVAULT_DATA_DIR` (and `REALMSWAP_HOST_DATA_DIR`) at it — server files,
  backups, and snapshots land on the share.
- **Agent**: set `REALMSWAP_AGENT_HOME` at a mount and every node's server
  data + backups collect on the same storage.

One hard rule: **keep the SQLite database on local disk**. SQLite over NFS
is documented by the SQLite project as prone to corruption (its file-locking
assumptions don't hold on network filesystems). The dashboard keeps the DB
separate from server data by design (`DATABASE_URL=file:/data/realmswap.db`
with `/data` local; mount the share at a different path and point
`GAMEVAULT_DATA_DIR` at it instead... except the DB lives under the data
dir — so on a shared-storage setup, move ONLY the heavy trees: bind-mount
the share over `local-servers/`, `local-backups/`, and `snapshots/`
subdirectories, and leave the DB file on local disk).

Also mind latency: game servers write saves frequently; a 1GbE mount is
fine, Wi-Fi-attached storage is not.

## Verifying a fresh install

1. `docker compose logs realmswap` — expect `[migrate-on-boot] Applied N pending migration(s).`
2. Dashboard loads, sign-up works (Supabase), first account = ADMIN.
3. Docker status check passes (`GET /api/system/docker-status` → the create
   form enables the Docker runtime).
4. Deploy a Valheim or Zomboid server with the Docker runtime → goes Online.
5. Players panel shows real counts (game-host reachability working).
6. Take a backup → a zip appears under `./data/local-backups/<serverId>/`.

## Remote nodes (the agent)

Host game servers on OTHER machines while managing them from this dashboard:
each node runs the RealmSwap agent, a dependency-free Node process that dials
home over one HMAC-secured channel (nothing listens on the node, no database
on the node). The dashboard ships fully-resolved launch plans; the agent just
writes config files and runs Docker containers.

Setup:

1. Dashboard → **Nodes** → add a node (ADMIN). You get a single-use,
   24-hour enrollment token.
2. On the target machine (needs Node 22 + Docker):

   ```sh
   npm run agent -- register --server http://<dashboard-host>:3000 --token <token>
   npm run agent -- run
   ```

   State lives in `~/.realmswap-agent/agent.json` (chmod 600); set
   `REALMSWAP_AGENT_HOME` to relocate it.
3. The node appears online in **Nodes**, and the server create form gains a
   **Remote Node** runtime with a node picker.

What works for remote-node servers today: start/stop/restart, console
(logs + commands, streamed through the same pipeline as local servers),
telemetry, status page, player counts, RCON, join info via the node's LAN
IP, crash auto-restart (dashboard-owned, same policy as the Docker runner),
and **backups** — the agent tars the world with the system tar, uploads it
over the signed channel, and the dashboard runs the normal machinery
(verify, retention, offsite S3). Restores stream back the same way, staged
and swapped atomically on the node.

What honestly refuses for remote-node servers (it operates on the
dashboard's disk): mod installs/config, the config editor, world
import/export, vault archives, SFTP panel, RealmSync invites, playit
tunnels, and cloud transfer. Each returns a clear message instead of
silently doing the wrong thing. Moving those behind the agent is the next
phase of this thread.
