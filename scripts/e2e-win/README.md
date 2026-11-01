# Windows CI smoke driver (Layer 3 of the zero-human test plan)

`smoke.ts` is the script behind `.github/workflows/windows-smoke.yml`: two
zero-human `windows-latest` jobs that turn the plan's Layer 3 into permanent
automated checks. Trigger them with **Windows Smoke → Run workflow** (works
from any branch — that's how PRs validate this workflow before merge) and
automatically after each successful **Release** run.

```
npx tsx scripts/e2e-win/smoke.ts --mode build-smoke      # job 1: freshly built installer
npx tsx scripts/e2e-win/smoke.ts --mode release-update   # job 2: released installers + auto-update
npx tsx scripts/e2e-win/smoke.ts --mode selftest         # no app needed; any platform
```

## What each job proves

**build-and-smoke** — builds the real NSIS installer from the branch (the exact
release.yml pipeline minus secrets: fake Supabase baked at build time, dummy
provider keys), silent-installs it (`/S`), launches it with a throwaway
`GAMEVAULT_USER_DATA_DIR` and asserts from `startup.log`:

- `startup: packaged launch`, `migrations applied: […]`,
  `provider keys from package: <both dummy keys>`, `server ready on port N`,
  and **no** `STARTUP ERROR`;
- `/start` answers on the logged port;
- a **minted offline session** is accepted (see below) —
  `GET /api/servers → 200`;
- a **real Minecraft boot**: create → start → `RUNNING` (bundled-JRE
  provisioner + piston-meta server jar download) → TCP accepts on 25565 →
  gamedig `query` → console `list` → logs contain the `Done (…)` line;
- when `PLAYIT_AGENT_SECRET` is set: the **playit tunnel** — the agent secret
  is pre-seeded into `<userData>/playit/<serverId>/playit.toml` so the app
  skips its human-claim flow and spawns `playitd` directly; the rundata mirror
  lands in `server.tunnelUrl`; the relay address is asserted TCP-reachable;
  toggling off clears the address;
- stop → `STOPPED` → port closed.

**auto-update-proof** — release artifacts only: silent-installs the **previous
release**, launches it, and lets its own `electron-updater` (auto-download, 10s
after boot) stage the update to Latest. The driver applies the very installer
electron-updater staged (`<LOCALAPPDATA>/<updaterCacheDirName>/pending/*.exe`,
version-checked against Latest), relaunches on the **same** userData dir, and
asserts: installed version == Latest, `migrations applied: […]` on the
carried-over DB (the real upgrade path), and the updated app still serves the
authenticated API. The on-quit install transition itself
(`autoInstallOnAppQuit`) is covered by `electron/__tests__/autoUpdate.test.js`
and the GUI e2e pass; this job proves the network half (old release finds and
stages the right artifact) and the install half (it applies and boots) on the
real published artifacts.

## Hermetic auth (no Supabase project, no e2e account)

The driver launches the app with `SUPABASE_JWT_SECRET` in its environment, so
the app's documented offline verification path
(`src/lib/supabase/verifyLocal.ts`) accepts HS256 tokens minted by the local
fake Supabase (`../e2e-api/fakeSupabase`). The session cookie is minted
directly — name `sb-<host-first-label>-auth-token` (the `@supabase/ssr`
storage-key rule), value = the raw auth-js session JSON — because
`POST /api/auth/login` talks to whichever Supabase URL was baked at build time
(fake in job 1, the real project in job 2's released installers). The
middleware's `getUser()` race is best-effort by design (4s timeout, cookies
untouched on a failed lookup), and minted tokens expire in a year, so no
refresh round-trip can drop the session mid-run.

The first user in the throwaway DB becomes ADMIN, which is what the
create-server / tunnel-toggle routes require.

## Report format

`SMOKE_REPORT_DIR/windows-smoke-report.json` (uploaded as a workflow artifact
alongside `startup.log` and the Electron process output):

```json
{
  "mode": "build-smoke | release-update",
  "checks": [ { "id": "mc/create-and-boot", "status": "pass|fail|skip", "detail": "…", "ms": 4321 } ],
  "passed": 7, "failed": 0, "skipped": 1
}
```

Exit code is non-zero only when a check **failed**; `skip` never fails the run
(the tunnel checks skip with an explanation when `PLAYIT_AGENT_SECRET` is
absent).

## One-time: PLAYIT_AGENT_SECRET (tunnel proof)

playit's claim flow requires a human to visit the claim URL — by design, and
RealmSwap honors that (it polls `WaitingForUserVisit` forever rather than
faking an approval). To keep the tunnel check zero-human anyway, the job
pre-seeds an **existing** agent secret, which the app's tunnel lifecycle picks
up instead of claiming (`readPlayitSecret` short-circuits the claim phase).

One-time setup:

1. Sign in at playit.gg (a dedicated CI account is fine — tunnels it creates
   are throwaway), open the dashboard's agent settings and copy the **agent
   secret**.
2. `gh secret set PLAYIT_AGENT_SECRET` on this repo.

Without the secret the workflow is green with two `skip` entries; with it, the
tunnel creation through playit's internet-facing relay (no router needed —
that's what makes this CI-doable) is asserted end to end.
