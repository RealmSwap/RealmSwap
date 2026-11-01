---
name: verify
description: "One entry point for full functional verification of this repo: npm run verify locally, the nightly heavy matrix in CI, and the Windows PC smoke after a release. Use when the user says 'verify', 'run the full checks', 'is everything green', 'pre-merge checks', 'release checks', or asks what testing exists; also use before claiming a risky change is done."
trigger: /verify
---

# /verify — full functional verification

The repo's zero-human test plan (5 layers) is fully built. Full functional
verification is three things, in order of cost:

1. **`npm run verify`** — local, ~15 min. The every-PR tier. Run this before
   claiming any non-trivial change is done.
2. **A green nightly** — the "Nightly Heavy" GitHub workflow runs the @heavy
   tier (real loader installs + boots, the full ATM10/Adrenaline pack
   pipeline, CurseForge pack, bot boot, all-11-games CRUD sweep, GUI-driven
   Modrinth install, and the full Windows smoke incl. auto-update proof) on
   the default branch every night at 08:30 UTC. Check it after merging
   anything the heavy tier touches. Manual run: `gh workflow run nightly.yml`.
3. **`npm run e2e:win:pc` on a real Windows PC** — after each release cut.
   The only surface a CI VM can't see: UPnP against the real router, external
   reachability, playit tunnel on the real network, full ATM10 on NTFS,
   locked-jar quarantine, Defender/cold-FS timings. Writes
   `win-smoke-report.json`.

## What `npm run verify` runs (fail-fast, staged)

| Stage | What it proves |
|---|---|
| `typecheck` | `tsc --noEmit` (parks a stale untracked `dist/` bundle first — it fakes ~50 errors) |
| `unit` | full vitest suite |
| `template-db` | `make-template-db.js` prints "Template DB created" — every real migration through the packaged runner |
| `api-e2e` | API e2e harness @smoke (or all scenarios with `verify:heavy`): real Next server, throwaway DB, fake Supabase, **real MC boot** |
| `gui-e2e` | Electron GUI harness @smoke (or all with `verify:heavy`): login → wizard → real MC boot watched over SSE console |
| `playwright` | the 9 `@public` Playwright specs — **auto-skipped when the :3000 dev server is up** (Next's project lock blocks the :3100 webserver). verify never kills your dev server; stop it first if you want this stage |

`npm run verify:heavy` swaps the e2e stages to their `:heavy` variants
(~30 min). Exit code 0 = all runnable stages green; skips are marked `○` in
the summary table, never silently. Report JSON:
`/tmp/realmswap-verify/verify-report.json`.

## Harness entry points (what CI calls)

- `npm run e2e:api` / `e2e:api:heavy` — `scripts/e2e-api/`, report at
  `/tmp/realmswap-e2e-api-data/e2e-api-report.json`. Debug one scenario:
  `npx tsx scripts/e2e-api/run.ts --tag all --only <scenarioId>`.
- `npm run e2e:gui` / `:heavy` / `:packaged` — `scripts/e2e-gui/`.
- `npm run e2e:win` / `:selftest` — `scripts/e2e-win/` (Windows CI driver).
- `npm run e2e:win:pc` / `:selftest` — `scripts/win-smoke.mjs` (PC harness;
  refuses to run on non-Windows).

## CI workflows

- **CI** — every push/PR: vitest, Playwright @public, api-e2e @smoke (real MC
  boot), gui-e2e @smoke.
- **Windows Smoke** — every PR touching it + after every Release: installer
  silent-install, real MC boot on NTFS, playit tunnel (when
  `PLAYIT_AGENT_SECRET` is set), release-artifact auto-update proof. Also
  called nightly.
- **Nightly Heavy** — the matrix above, nightly + dispatch.
- The **route-ledger guard** (`src/app/api/__tests__/routeLedger.test.ts`)
  fails CI when a new API route ships without a harness entry in
  `scripts/e2e-api/routes-ledger.json` — coverage can't silently rot.

## Gotchas

- **Residual human-only surfaces** (everything else is automated): a real
  Discord `/play` from a real client, a real game client joining, real Stripe
  checkout, subjective UI feel, a second physical location joining.
- tsc gates: park `dist/` (verify does it for you) and remember harness TS
  errors surface in `next build`, not vitest.
- e2e-api and e2e-gui are hermetic (fake Supabase, `.next-e2e` build dir,
  throwaway DB) — safe next to a running :3000 dev server. Playwright is not
  (shared `.next` + project lock).
- After merging PRs: restart the :3000 dev server on the updated main.
- SteamCMD game boots (Valheim/Terraria) are the one matrix leg that lives on
  the PC harness, not CI.
