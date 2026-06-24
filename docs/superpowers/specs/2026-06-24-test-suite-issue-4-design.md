# Issue #4 — Test suite completion + CI

## Context

Issue #4 ("Add a test suite") asked for vitest setup, unit tests for
config-template rendering and `GameDefinition` validation, crash-detection /
auto-restart tests, backup path tests, and CI wiring.

Most is already done: `vitest.config.ts` exists, `npm test` runs, and 96 tests
pass across 15 files (template rendering, validation, command resolution, slugs,
download progress, shutdown). This spec covers the remaining gaps.

## Remaining gaps

1. **CI** — no `.github/` directory exists; tests never run automatically.
2. **Crash-detection / auto-restart** — logic lives inline in
   `localRunner.ts` `handleProcessExit` (retry counter, 10-min window, max-3
   retries), entangled with Prisma/child_process, so it is not unit-testable.
3. **Backup path handling** — `getSavePath()` in `backupService.ts` is a
   pure-ish per-game path mapper but is private and untested, and the file
   imports Prisma so it cannot be tested DB-free as-is.

## Design

Follows the repo's established pattern: extract pure decision logic into a small
helper (cf. `pickEntryPath`, `isMissingConfigError`) and unit-test the helper.

### A. CI workflow — `.github/workflows/ci.yml`

- Triggers: `push` and `pull_request`.
- Single job on `ubuntu-latest`: checkout → `actions/setup-node@v4` (Node 20,
  npm cache) → `npm ci` (the `prisma generate` postinstall runs fine) →
  `npm test`.
- Scoped to the test suite only (not `next build` / electron) so CI stays fast
  and green on the existing suite.

### B. Crash policy — `src/lib/crashPolicy.ts` (pure)

- Owns `CRASH_MAX_RETRIES`, `CRASH_WINDOW_MS`, and the `CrashCounter` type.
- `isCrashExit(wasIntentional, code)` → `!wasIntentional && code !== null &&
  code !== 0`.
- `evaluateCrash(prev, now, opts?)` → `{ counter, shouldRestart, exhausted }`,
  encapsulating window-reset + increment + the `count < maxRetries` branch.
- `localRunner.ts` `handleProcessExit` is refactored to import and call these.
  Behavior-preserving: same reset condition, same increment, same
  restart-vs-exhaust decision.

### C. Backup paths — `src/lib/backupPaths.ts` (pure, no Prisma import)

- `getSavePath(game, serverId, { dataRoot, userProfile })` moved out of
  `backupService.ts`, with roots injected rather than called internally.
- `backupService.ts` imports it and passes `dataRoot()` and
  `process.env.USERPROFILE`.

## Tests

- `crashPolicy.test.ts`: crash-vs-clean classification; first/second crash
  restart; third crash exhausts; window-expiry reset; within-window
  accumulation.
- `backupPaths.test.ts`: per-game path mapping (Minecraft, Valheim, Enshrouded,
  Zomboid, Ark); case-insensitive game match; Valheim userProfile-based path;
  unsupported-game throw.

## Risk

B and C touch production files, but both are pure extract-and-delegate refactors
with no behavior change. The existing 96 tests plus the new ones guard the
change.
