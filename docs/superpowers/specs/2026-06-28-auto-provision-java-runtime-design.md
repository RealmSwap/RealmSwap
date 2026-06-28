# Auto-Provision Java Runtime for Minecraft (and other Java servers)

**Date:** 2026-06-28
**Status:** Approved design — ready for implementation plan

## Problem

Starting a Minecraft server locally fails for many users because of Java. The current
runner ([`src/lib/runners/LocalWindowsRunner.ts`](../../../src/lib/runners/LocalWindowsRunner.ts))
only checks whether *any* `java` is on `PATH`:

```ts
if (requiresJava) {
  if (!(await checkJavaInstalled())) {
    throw new Error("Java Runtime Environment (JRE) was not found ... Please install Java (JDK/JRE 17+) ...");
  }
}
```

This produces two distinct user-facing failures:

1. **No Java installed** → a hard wall. The user must find, download, and install a JDK/JRE
   themselves before the app works. (This is the manual step the maintainer hit.)
2. **Wrong Java version installed** → the check *passes* (some `java` is on PATH), the server
   launches, then crashes with a cryptic `UnsupportedClassVersionError`. The Minecraft server
   jar requires a specific Java *major* version (current vanilla, Minecraft 26.2 → Java 25); an
   older system Java (e.g. 8, 17, or 21) silently fails this way.

Both contradict the app's simplicity goal: the user should never have to think about Java.

The pinned Minecraft server-jar URL being "wrong" was the related earlier symptom. Investigation
shows the runtime source (`builtins.ts`) already points at the current latest release
(Minecraft 26.2), so the URL itself is fine — but that jar requires **Java 25**, and the old
`requiresJava` check happily passed on any older system Java, producing the mismatch crash. So the
URL and the Java problem are the same root cause: *the required Java version was never enforced or
provided.* Dynamic URL resolution remains **out of scope**; matching and providing the right Java
is the fix.

## Goal

When a Java-based server starts, automatically ensure the **correct Java major version** is
present and launch using it — no manual install, no dependence on the user's `PATH`, no version
mismatch. The process is invisible: a progress bar, identical in feel to the existing
download/SteamCMD provisioning.

## Approach

Download a version-matched JRE on demand from the **Adoptium Temurin** API, cache it in the
app data directory, and launch the server with that JRE's absolute path. This mirrors the
existing on-demand provisioning of SteamCMD (`setupSteamCMD`), so it fits the codebase and
stays invisible to the user.

Rejected alternatives:
- *Ship JREs in the installer* — bloats the installer by 100 MB+ per major version and can't
  adapt to future version requirements.
- *Install Java via winget/choco* — adds an external dependency and admin prompts; fights the
  simplicity goal.

## Design

### 1. Declare the required Java version in the definition

Add an optional field to `GameDefinitionSpec` in
[`src/lib/definitions/types.ts`](../../../src/lib/definitions/types.ts):

```ts
requiresJava?: boolean;
javaMajor?: number;   // initial Java major version to provision (e.g. 25). Meaningful only when requiresJava.
```

`javaMajor` is the **initial guess**, not a hard requirement — the self-healing mechanism
(section 3a) corrects it at runtime if the jar actually needs a newer Java.

- The Minecraft built-in sets `requiresJava: true, javaMajor: 25`.
- **Why 25:** the runtime source `builtins.ts` pins the Minecraft server jar to the *latest*
  release. As of this writing that hash resolves (via Mojang version metadata) to Minecraft
  **26.2**, whose declared `javaVersion.majorVersion` is **25**. (The dev-seed JSON's older hash
  resolves to Minecraft 1.20.4 → Java 17 — see section 4.)
- **Why 25 is a robust default specifically:** the JVM is backward compatible — a Java 25 runtime
  runs any jar compiled for Java ≤ 25. So provisioning Java 25 works for the current latest jar
  *and* every older Minecraft. The only case it cannot cover is a *future* jar requiring Java > 25,
  which the self-healing path (section 3a) detects and fixes automatically.
- The runner treats a missing `javaMajor` as **25** (`spec.javaMajor ?? 25`). This keeps existing
  user DBs that were seeded before this field existed working with no re-seed required.

`javaMajor` flows through unchanged via `parseSpec`/`stringifySpec` (plain JSON). It does not
need to be added to `InstallPlan`/`LaunchPlan`; the runner already holds the full `spec` and
reads `spec.javaMajor` directly. `validateSpec` does not need a new rule (optional numeric field),
though an optional sanity check (`javaMajor` is a positive integer when present) may be added.

### 2. New module: `src/lib/runtimes/javaRuntime.ts`

A self-contained, unit-testable module whose single public job is:

```ts
ensureJava(major: number, opts: {
  dataRoot: string;
  onLog?: (msg: string) => void;
  onProgress?: (percent: number | null, label: string) => void;
}): Promise<string>   // resolves to an absolute path to java.exe
```

Behavior:

1. **Cache location:** `path.join(dataRoot, "runtimes", "jdk-<major>")`. Shared across all
   servers (NOT per-server) so a ~45 MB JRE is downloaded at most once per major version.
2. **Already provisioned?** If `<cacheDir>/bin/java.exe` exists, return it immediately.
3. **Download** from the Adoptium Temurin API:
   `https://api.adoptium.net/v3/binary/latest/<major>/ga/windows/x64/jre/hotspot/normal/eclipse`
   This endpoint **302-redirects** to the actual archive (`.zip`). The download must follow
   redirects.
4. **Extract** the `.zip` with PowerShell `Expand-Archive` (the same mechanism `setupSteamCMD`
   uses for `steamcmd.zip`). The archive contains a single top-level directory
   (e.g. `jdk-21.0.x+y-jre/`); flatten it so `java.exe` lands at `<cacheDir>/bin/java.exe`.
5. **Verify** `<cacheDir>/bin/java.exe` exists; delete the partial download and any half-extracted
   directory on failure so a retry starts clean (consistent with the existing
   "clean failed downloads" behavior in the runner).
6. Return the absolute path.

**Redirect-aware download:** the existing `downloadFile` in the runner uses `https.get` and does
not follow 3xx redirects. Provide a redirect-following download inside this module (cap redirects,
e.g. 5). Generalizing the runner's `downloadFile` to follow redirects is an acceptable alternative,
decided during implementation; the design requires only that the JRE download follows redirects.

**Pure helpers (extracted for unit tests, deps injected like `resolveExecutablePath`):**
- `adoptiumUrl(major)` → the request URL.
- `findArchiveJavaRoot(entries, exists)` → locate the extracted top-level dir / the dir containing
  `bin/java.exe` for flattening.
- `parseRequiredJavaMajor(text)` → parse a JVM `UnsupportedClassVersionError` message and return
  the Java major the jar needs (see section 3a). Lives in this module since it concerns Java
  versioning; consumed by the runner's self-heal path.

### 3. Runner integration (`LocalWindowsRunner.ts`)

Replace the throw-block (currently lines ~495–499):

A per-server "learned Java major" override map (globalThis-backed, like `localProcesses`) lets the
self-heal path force a specific version on the next start:

```ts
// globalForRunner gains: javaMajorOverrides: Map<string, number>
const major = javaMajorOverrides.get(serverId) ?? spec.javaMajor ?? 25;
let javaExe: string | undefined;
if (requiresJava) {
  setProgress(serverId, { phase: "java", percent: null, label: `Preparing Java ${major}…` });
  try {
    javaExe = await ensureJava(major, {
      dataRoot: dataRoot(),
      onLog: logWriter,
      onProgress: (percent, label) => setProgress(serverId, { phase: "java", percent, label }),
    });
  } catch (err: any) {
    clearProgress(serverId);
    logWriter(`Java runtime setup failed: ${err.message}`);
    throw new Error(`Failed to prepare the Java runtime needed to run this server: ${err.message}`);
  }
}
```

At spawn time, when `requiresJava` and the launch executable is the bare `java` command, use the
provisioned absolute path instead of PATH-resolving `java`:

```ts
const resolvedExe = resolveCommand(installDir, launch.executable, launch.executableOnPath);
let finalExe: string;
if (requiresJava && launch.executable === "java" && javaExe) {
  finalExe = javaExe;                 // bundled JRE — never trust the user's PATH java
} else if (launch.executableOnPath) {
  finalExe = resolveExecutablePath(resolvedExe, process.env.PATH || "",
    process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM", fs.existsSync);
} else {
  finalExe = resolvedExe;
}
```

`executableOnPath` semantics for non-Java launchers (e.g. `cmd.exe` for Zomboid) are unchanged.
The `"java"` progress phase is added alongside the existing `steam`/`download`/`extract`/`script`
phases (UI label "Downloading Java 25 …%"); the existing `DashboardView` progress UI renders the
`label`/`percent` and is phase-agnostic, so **no UI change is required**.

### 3a. Self-healing on Java version mismatch

If the provisioned Java is older than the jar needs (only possible for a *future* Minecraft jar
requiring Java > the `javaMajor` guess), the JVM exits immediately and prints to stderr, e.g.:

```
java.lang.UnsupportedClassVersionError: net/minecraft/bundler/Main has been compiled by a more
recent version of the Java Runtime (class file version 69.0), this version of the Java Runtime
only recognizes class file versions up to 65.0
```

`parseRequiredJavaMajor(text)` (in `javaRuntime.ts`) extracts the **needed** class-file version
("class file version 69.0") and converts it to a Java major: `classFileVersion - 44`
(69 → 25, 65 → 21, 61 → 17). It returns `null` when no such line is present.

The runner already captures all stderr into the per-server log file. In `handleProcessExit`,
**before** the existing crash-counter logic, check for a version mismatch:

```ts
// Self-heal: the server may have failed only because the bundled Java was too old for the jar.
const required = parseRequiredJavaMajor(getServerLogTail(serverId));
if (required && javaMajorOverrides.get(serverId) !== required) {
  javaMajorOverrides.set(serverId, required);      // learn it; next start downloads the right Java
  appendLog(serverId, `[Java] This server needs Java ${required}. Downloading it and retrying…`);
  await prisma.server.update({ where: { id: serverId }, data: { status: "STARTING", pid: null } });
  serverEventBus.emit("status_update", { serverId, status: "STARTING" });
  startLocalServer(serverId, serverRec.game, serverRec.ramAllocation).catch((e) =>
    appendLog(serverId, `[Java] Retry after version detection failed: ${e.message}`));
  return;                                            // do NOT consume a crash-retry for this
}
```

Key properties:
- The `javaMajorOverrides.get(serverId) !== required` guard makes this fire **at most once per
  distinct required version**, so a genuinely broken server cannot loop forever.
- It runs before crash detection, so a version mismatch does not burn the crash-retry budget and
  does not get mislabeled as a crash.
- The learned override is sticky for the process lifetime of the app, so subsequent starts of that
  server provision the correct Java directly with no failed launch.
- Offline degradation: if the corrected Java cannot be downloaded (no network), `ensureJava`
  rejects and the start fails with the clear "Failed to prepare the Java runtime…" message.

### 4. Where the change actually lands (corrected seeding architecture)

Investigation during planning revised the original assumption here. There are **two separate
built-in sources**, and they have fully diverged:

- **`src/lib/definitions/builtins.ts` (8 games) — the runtime source of truth.** The app seeds
  built-ins at runtime via [`src/app/api/definitions/route.ts`](../../../src/app/api/definitions/route.ts)
  → `ensureBuiltinsSeeded()` ([`ensureSeeded.ts`](../../../src/lib/definitions/ensureSeeded.ts))
  → `upsertBuiltinDefinitions()` ([`seed.ts`](../../../src/lib/definitions/seed.ts)), which reads
  `BUILTIN_DEFINITIONS` from `builtins.ts`. This is what populates a real user's `gameDefinition`
  table. The test suite (`builtins.test.ts`, `parity.test.ts`) also pins `builtins.ts` (asserts
  exactly the 8 games).
- **`src/lib/definitions/builtins.generated.json` (10 games) — dev/demo seed only.** It is read
  *only* by `prisma/seed.js`, the script that creates the demo user ("Cody Gamer") and demo
  servers. It has drifted well ahead of `builtins.ts`: it adds two extra games (Satisfactory,
  V Rising), `readyPattern` on most games, `preLaunchDirs`, a corrected Minecraft URL, and a
  different motd. Nothing in the build pipeline regenerates it from `builtins.ts`
  (`make-template-db.js` ships an *empty* migrated DB; runtime seeding uses `builtins.ts`).

**Implications for this feature:**
1. The runtime change is a single edit: add `javaMajor: 25` to the Minecraft spec in **`builtins.ts`**
   (`requiresJava: true` is already present). That reaches real users via `ensureBuiltinsSeeded`.
2. **Do NOT run the documented `npx tsx … regenerate` command.** Regenerating
   `builtins.generated.json` from the current `builtins.ts` would delete Satisfactory and V Rising
   and strip every `readyPattern`/`preLaunchDirs` from the dev seed — a regression. The regenerate
   workflow noted in the old custom-server-definitions plan is obsolete.
3. For mirror consistency only, hand-add `"javaMajor": 25` to the existing Minecraft entry in
   `builtins.generated.json` (a one-line edit, no regeneration). This has no runtime impact (it is
   dev-seed only) but keeps the demo seed aligned. Note: that dev-seed entry still pins Minecraft
   1.20.4 (Java 17); 25 is harmless there because the JVM is backward compatible, and the self-heal
   path would correct it anyway.
4. Existing user DBs are re-upserted on the next definitions API call (`ensureBuiltinsSeeded` runs
   `update` for existing slugs), so they pick up `javaMajor: 25`. Even if they didn't, the runner's
   `spec.javaMajor ?? 25` default plus the self-heal path covers Minecraft regardless.

The broader divergence between `builtins.ts` and `builtins.generated.json` (8 vs 10 games, missing
`readyPattern`s) is a pre-existing latent issue and is **out of scope** for this feature; it is
flagged for separate follow-up.

### 5. Error handling & disk space

- Network/extract failures surface an actionable message ("Failed to prepare the Java runtime …")
  and leave no partial files (delete partial `.zip` and half-extracted dir).
- Optionally reuse `getFreeDiskSpaceGB` to pre-check ~0.3 GB before downloading the JRE, matching
  the SteamCMD disk-check pattern. Low priority; decide in plan.

## Testing

Following TDD, the testable surface is the pure module — the runner spawn path is integration-level
and stays thin.

- `javaRuntime` unit tests (deps injected, no real network/fs):
  - `adoptiumUrl(major)` produces the expected URL for a given major.
  - `findArchiveJavaRoot` locates the `bin/java.exe`-bearing directory for flattening.
  - `parseRequiredJavaMajor` maps representative `UnsupportedClassVersionError` messages to the
    right Java major (class file 69 → 25, 65 → 21, 61 → 17) and returns `null` for unrelated text.
  - `ensureJava` "already provisioned" short-circuit returns the cached path without downloading
    (inject the download/extract/exists deps and assert no download is attempted).
- Definition tests:
  - The Minecraft built-in in `builtins.ts` has `requiresJava: true` and `javaMajor: 25`
    (extend `builtins.test.ts` / `parity.test.ts`).
  - Every built-in spec still validates (`validateSpec` returns `[]`), including with the new
    `javaMajor` field present.
  - The 8-game assertion in `builtins.test.ts` is unchanged (we are NOT adding games here).

## Scope

**In scope:** auto-provisioning a version-matched Windows x64 JRE for `requiresJava` definitions;
launching with its absolute path; self-healing the Java version on `UnsupportedClassVersionError`;
adding `javaMajor` to the Minecraft built-in (and a one-line mirror edit to the dev-seed JSON).

**Out of scope (YAGNI):**
- Dynamic Minecraft version selection via the Mojang version manifest (the runtime jar already
  tracks the latest release).
- Fully reconciling `builtins.ts` ↔ `builtins.generated.json` (8 vs 10 games, missing
  `readyPattern`s) — pre-existing drift, flagged for separate follow-up.
- Modded servers (Forge/Fabric/Paper) — different jars/launch flows.
- Non-Windows / non-x64 runtimes and the Linux container path (the app targets Windows x64;
  Minecraft has no container spec today).
