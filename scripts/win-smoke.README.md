# RealmSwap PC smoke — `scripts/win-smoke.mjs` (Layer 4)

One command on the real Windows PC that verifies everything a VM can't: the
real router's UPnP, the real LAN/public addresses, the playit relay from a real
network, a full modpack pipeline on real NTFS + Defender, Windows file-lock
semantics, and the real auto-update path. This retires the manual Windows
smokes that have been run by hand after every release (UPnP, tunnel, ATM10,
locked-jar, auto-update) as a permanent, repeatable check.

## Run it

Prerequisites: the RealmSwap app installed, Node 18+ (`node -v`), the app
**not running** (quit it from the tray first), and internet access.

```powershell
git clone https://github.com/RealmSwap/RealmSwap.git   # or reuse an existing clone (git pull)
cd RealmSwap
node scripts\win-smoke.mjs
```

~45 minutes (the ATM10 pipeline dominates). Useful flags:

| Flag | Effect |
|---|---|
| `--selftest` | Pure-logic checks only, no app needed, any OS (runs in CI too) |
| `--only upnp,tunnel` | Run just the checks whose ids start with these prefixes |
| `--skip pack/atm10-pipeline` | Skip the big pack pipeline (prefix match, comma list) |
| `--pack-id <number>` | Install this CurseForge pack id instead of resolving ATM10 via live search |
| `--pack-ram 8` | RAM (GB) for pack servers (default 8; `-Xmx{ram}G`) |
| `--playit-secret <key>` | Playit agent secret for the tunnel check; falls back to `PLAYIT_AGENT_SECRET`, then to the real install's saved playit identity (read-only) |
| `--keep` | Keep the throwaway data dir for debugging |
| `--report-dir <path>` | Where `win-smoke-report.json` lands (default: current directory) |

Output: live ✓/○/✗ per check, a PASS/FAIL table at the end, and
`win-smoke-report.json` — hand that file (plus the console tail) back.

## What it proves, check by check

| Check | What it proves |
|---|---|
| `preflight/*` | Finds the installed exe, reads its version, and **refuses to run if RealmSwap is open** (the single-instance lock would no-op the harness launch; the harness never kills your running app) |
| `boot/launch-isolated-data` | Launches the installed app against a throwaway `%TEMP%` data dir; **guards that `%APPDATA%\RealmSwap` stayed silent** (an app predating PR-D #202 ignores the override and fails honestly instead of touching real data); asserts the packaged-boot markers incl. real provider keys |
| `auth/minted-session-accepted` | Mints an HS256 session the app's documented `SUPABASE_JWT_SECRET` offline-verify path accepts — no login, no Supabase network, nothing written to the real account |
| `upnp/public-server-boot` | Real Minecraft boot on the real machine (wall time recorded — the Defender/cold-FS honesty metric) |
| `upnp/connectivity-public` | With UPnP on, the app reports the router check ok, the **real public IP** (cross-checked against ipify from the harness), and Join Info `addressPath: "public"` with the correct address (#195) |
| `upnp/router-mapping-truth` | The harness itself speaks SSDP+SOAP to the **router** (`GetSpecificPortMappingEntry`) and confirms the mapping exists — not just that the app requested it |
| `upnp/external-reachability` | check-host.net probe nodes connect to `publicIP:port` from the internet (the #164 owed smoke's final mile; a refusal with a mapping present usually means Windows Firewall — the detail says so) |
| `mc/query-and-console` | gamedig query online + console answers while the UPnP server runs |
| `joininfo/lan-honesty` | A second server with UPnP off advertises the **real LAN IP** with `addressPath: "lan"` and the router check fails honestly (#195) |
| `tunnel/*` | playit tunnel through the real relay from the real network, TCP reachability + relay latency, `addressPath: "tunnel"`, clean disable (needs a secret; skips honestly without one) |
| `upnp/mapping-released` | After a clean stop the **router itself** reports the mapping gone (error 714) and the port is closed |
| `pack/atm10-pipeline` | The smoke owed since v0.5.5: fresh server → vanilla boot → CurseForge ATM10 resolved via the app's live pack search → full install-pack pipeline (client-only exclusions reported, loader provisioned, real mod rows + jars on NTFS) → packed boot to RUNNING → gamedig query online → clean stop |
| `pack/retire-replaced-mods` | Deterministic Adrenaline pins (same artifacts as the e2e-api scenario): newer version installed → older version re-imported → "mods from the previous pack install" retirement warning + mod rows shrink (`retireReplacedPackMods` on real NTFS) |
| `pack/locked-jar-quarantine` | A crafted crash-jar is held by a **no-share file handle** (how Windows AV locks jars — Node's own handles don't reproduce it, so PowerShell holds it) → the install fails honestly with a safe rollback and no hang; after release, the same install succeeds, the bomb jar is quarantined, and the real mod survives |
| `autoupdate/*` | Installed version vs GitHub Latest. If behind: electron-updater stages the real differential update on this machine → staged installer applied → relaunch at Latest → migrations + minted-session API still work. If current: proves no spurious staged download appears in 90s |

## Isolation contract

- All app data (DB, servers, backups, startup.log, playit config) lives in a
  throwaway `%TEMP%\winsmoke-userdata-<ts>` dir, deleted at the end unless
  `--keep`. The guard asserts the real `%APPDATA%\RealmSwap` was never written.
- Servers created by the run are stopped through the API (clean stop → UPnP
  unmapped) and their data dies with the throwaway dir. A safety net deletes
  any UPnP mapping the run could have left behind even on failure paths.
- The run's only persistent side effects: `win-smoke-report.json` in your
  directory, and — if the app was behind Latest — the auto-update that brings
  it current.

## Version floor

The harness needs the installed app to honor `GAMEVAULT_USER_DATA_DIR`
(PR-D #202 — every release after v0.5.20). On older installs the isolation
guard fails the run with an "update first" message instead of touching real
data.
