/**
 * Boot-test retry for Minecraft modpack installs. Client-only mods that slip
 * past the static filter (clientModFilter.ts) die during mod construction
 * with a named crash report; manifest-less artifacts (shader/resource packs
 * bundled for clients) die with "File X is not a valid mod file" lines;
 * version-range failures ("Mod X only supports Y <range>") name modIds only.
 * This helper wraps testServerBoot: on failure it reads the newest crash
 * report — falling back to the captured boot output when FML died before
 * writing one — and heals what it can: bumping out-of-range dependencies
 * within the same project, quarantining every named jar (plus anything in
 * the pack that REQUIRES them), and quarantining the jar behind a mixin
 * handler mod id when the report carries client-dist evidence. Each action
 * surfaces as a warning so the user sees exactly what changed and why.
 */

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { dataRoot } from "@/lib/appPaths";
import { testServerBoot, SandboxBootError, resolveSandboxJava } from "@/lib/runners/sandbox";
import { planClientExclusions, scanJarClientSignals, type ExclusionCandidate, type TargetLoader } from "@/lib/mods/clientModFilter";
import { fetchLoaderBuild, curseForgeDownloadUrl } from "@/lib/mods/curseforge";
import { downloadFileWithRetry as downloadFile } from "@/lib/download";

const MAX_QUARANTINE_ROUNDS = 3;

/**
 * Waits between delete attempts for a jar Windows is holding. Windows AV
 * scanners can keep a freshly-downloaded, recently-loaded jar locked for
 * many seconds (seen live on v0.5.9: three attempts over 750ms all failed,
 * so the client-only mod shipped and the install rolled back without being
 * able to clear mods/). Injectable in tests; the real schedule spreads ~18s.
 */
const DELETE_DELAYS_MS = [250, 500, 1000, 2000, 4000, 2000, 2000, 2000, 2000, 2000, 2000, 2000];

/** Newest crash report in the server dir, or null. Boot tests write these. */
function newestCrashReport(serverRoot: string): string | null {
  const dir = path.join(serverRoot, "crash-reports");
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    return files[0] ? path.join(dir, files[0].f) : null;
  } catch {
    return null;
  }
}

/**
 * Every jar a crash report blames, in any of FML's shapes:
 * - "Mod file: mods/foo.jar" — named-mod loading failures;
 * - "Mod File C:\...\foo.jar needs language provider …" — pre-loading fatals;
 * - "File …\mods\foo.jar is not a valid mod file" — manifest-less artifacts;
 * - "… is a Fabric mod and cannot be loaded" and "… is for Minecraft Forge
 *   or an older version of NeoForge, and cannot be loaded" — cross-loader
 *   jars, which carry no "Mod file" line at all.
 */
function blamedModFiles(report: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /Mod [Ff]ile:?\s*([^\r\n]+?\.jar)/g,
    /File ([^\r\n]+?\.jar) is [^\r\n]*?cannot be loaded/gi,
    /File ([^\r\n]+?\.jar) is not a valid mod file/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(report))) names.add(m[1].split(/[\\/]/).pop()!);
  }
  return Array.from(names);
}

/**
 * The loader the server runs, from realmswap-loader.json (written by the
 * loader install). Cross-loader exclusion and start-crash healing both need
 * it; null when absent — the rules then fall back to manifest-less and
 * crash-blame handling only.
 */
export function serverLoaderType(serverRoot: string): "neoforge" | "forge" | "fabric" | "quilt" | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(serverRoot, "realmswap-loader.json"), "utf8"));
    const t = String(raw?.type ?? "");
    return t === "neoforge" || t === "forge" || t === "fabric" || t === "quilt" ? t : null;
  } catch {
    return null;
  }
}

/** The Minecraft version the installed loader targets, for same-project
 *  rebuild lookups (version-range bumps). Null when unknown. */
export function serverMinecraftVersion(serverRoot: string): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(serverRoot, "realmswap-loader.json"), "utf8"));
    const v = String(raw?.minecraftVersion ?? "");
    return v || null;
  } catch {
    return null;
  }
}

function listModsJarNames(serverRoot: string): string[] {
  try {
    return fs.readdirSync(path.join(serverRoot, "mods")).filter((f) => f.endsWith(".jar"));
  } catch {
    return [];
  }
}

/**
 * Delete a jar, tolerating the locks Windows AV scanners take on
 * recently-touched files. Returns false when the file survives every attempt
 * — a boot without it is impossible, so the caller must surface the failure
 * instead of retrying into the identical crash.
 */
async function forceRemoveJar(file: string, delays: number[] = DELETE_DELAYS_MS): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try { fs.rmSync(file, { force: true }); } catch {}
    let gone = false;
    try { gone = !fs.existsSync(file); } catch {}
    if (gone) return true;
    if (attempt >= delays.length) return false;
    await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
  }
}

/** Evidence, in the crash report itself, that the blamed mod is client-only. */
const CLIENT_DIST_EVIDENCE = /invalid dist/i;
/** FML's own verdicts that a named file cannot load on this server at all:
 * manifest-less artifacts ("not a valid mod file") and cross-loader jars
 * ("is a Fabric mod and cannot be loaded", "for Minecraft Forge or an older
 * version of NeoForge"). Both are unambiguous — no dist evidence needed. */
const UNLOADABLE_FILE_EVIDENCE = /is not a valid mod file|cannot be loaded/i;

/**
 * Start-failure self-heal for Minecraft. The boot-retry quarantine above only
 * runs inside install flows; a jar that reaches mods/ by any other route —
 * leftover from an older failed attempt, dropped in by hand, a dependent of
 * something that was removed — crashes every Start instead. On a crash whose
 * report names mod file(s), move the blamed jar(s) plus everything that
 * requires them out of mods/ when the report carries evidence the blame is
 * sound: client-only signals ("invalid dist" in the report, an earlywindow
 * service in the jar itself), or FML's own "not a valid mod file" verdict on
 * a manifest-less artifact (shader/resource packs).
 *
 * All-or-nothing: jars are MOVED out of mods/ into a quarantine folder (not
 * deleted — the user can restore or delete the folder). If any jar in the
 * closure survives Windows' locks mid-move, everything already moved is
 * moved back, so a half-closure — which would crash differently next boot —
 * can never be left behind.
 */
export async function quarantineFromStartCrash(args: {
  serverRoot: string;
  deps?: { renameDelaysMs?: number[] };
}): Promise<{ removed: string[]; warnings: string[]; quarantineDir?: string }> {
  const warnings: string[] = [];
  const reportPath = newestCrashReport(args.serverRoot);
  if (!reportPath) return { removed: [], warnings };
  // Only a report written by THIS crash counts. mods/ holds the newest
  // report's file otherwise — quarantining off a stale report would delete
  // mods over a crash they had nothing to do with.
  let reportAgeMs = Infinity;
  try {
    reportAgeMs = Date.now() - fs.statSync(reportPath).mtimeMs;
  } catch {}
  if (reportAgeMs > 5 * 60 * 1000) return { removed: [], warnings };
  const report = (() => {
    try {
      return fs.readFileSync(reportPath, "utf8");
    } catch {
      return "";
    }
  })();
  const blamed = blamedModFiles(report);
  if (blamed.length === 0) return { removed: [], warnings };

  const candidates: ExclusionCandidate[] = listModsJarNames(args.serverRoot).map((name) => ({
    file: path.join(args.serverRoot, "mods", name),
    signals: scanJarClientSignals(path.join(args.serverRoot, "mods", name)),
  }));
  const seeds = candidates.filter((c) => blamed.includes(path.basename(c.file)));
  if (seeds.length === 0) return { removed: [], warnings };
  if (
    !UNLOADABLE_FILE_EVIDENCE.test(report) &&
    !CLIENT_DIST_EVIDENCE.test(report) &&
    !seeds.some((s) => s.signals.hasEarlyWindowService)
  ) {
    return { removed: [], warnings };
  }

  const { excluded, reasons } = planClientExclusions(candidates, new Set(seeds.map((s) => s.file)), {
    targetLoader: serverLoaderType(args.serverRoot),
  });
  if (excluded.length === 0) return { removed: [], warnings };

  // Blamed jars first so a failure aborts before any dependent moves.
  const ordered = [
    ...excluded.filter((c) => blamed.includes(path.basename(c.file))),
    ...excluded.filter((c) => !blamed.includes(path.basename(c.file))),
  ];

  const renameWithRetry = async (from: string, to: string): Promise<boolean> => {
    const delays = args.deps?.renameDelaysMs ?? [250, 500, 1000, 2000, 4000, 2000, 2000];
    for (let attempt = 0; ; attempt++) {
      try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(from, to);
        return true;
      } catch {}
      let movedAnyway = false;
      try {
        movedAnyway = !fs.existsSync(from) && fs.existsSync(to);
      } catch {}
      if (movedAnyway) return true;
      if (attempt >= delays.length) return false;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  };

  const quarantineDir = path.join(args.serverRoot, `mods-quarantine-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const moved: Array<{ from: string; to: string }> = [];
  const restoreMoved = () => {
    for (const m of moved) {
      try {
        fs.renameSync(m.to, m.from);
      } catch {
        warnings.push(`Could not restore '${path.basename(m.to)}' from the quarantine folder — move it back into mods/ by hand.`);
      }
    }
  };

  for (const c of ordered) {
    const to = path.join(quarantineDir, path.basename(c.file));
    if (!(await renameWithRetry(c.file, to))) {
      warnings.push(
        `Could not move '${path.basename(c.file)}' out of mods/ — Windows held the file through every retry. ` +
          "The crash will repeat until that jar is removed."
      );
      restoreMoved();
      return { removed: [], warnings };
    }
    moved.push({ from: c.file, to });
  }

  const removed = ordered.map((c) => path.basename(c.file));
  for (const c of ordered) {
    warnings.push(
      `Moved '${path.basename(c.file)}' out of mods/ — ${reasons.get(c.file) ?? "client-only mod blamed by the crash report"}.`
    );
  }
  warnings.push(`The jars are kept in '${quarantineDir}' — delete that folder once the server is happy.`);
  return { removed, warnings, quarantineDir };
}

/**
 * FML pre-loading failures of the shape
 * "Mod tesseract_api only supports modern_industrialization 2.5.11- or above,
 * and below 2.6-" — the pack pinned an older build of a dependency than
 * another pack mod demands. Returns the (requiring, required) pairs.
 */
const RANGE_ERROR_RE = /Mod ([\w-]+) only supports ([\w-]+) ([^\r\n]+?) or above/g;

export function parseRangeErrors(report: string): { requiring: string; required: string }[] {
  const out: { requiring: string; required: string }[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = RANGE_ERROR_RE.exec(report))) {
    const required = m[2].toLowerCase();
    const key = `${m[1].toLowerCase()}->${required}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ requiring: m[1].toLowerCase(), required });
  }
  return out;
}

/**
 * Mixin handler frames in a stack trace name the owning MOD ID, not the jar:
 * "ResourceLocation.handler$bjn000$etf$illegalPathOverride" — the shape of the
 * live Society: Sunlit Valley crash, where a mod's mixin into ResourceLocation
 * loaded client-only Screen and FML's dist cleaner killed the JVM before any
 * crash report was written, so the boot output is the only evidence.
 */
export function parseMixinHandlerModIds(report: string): string[] {
  const out = new Set<string>();
  const re = /handler\$[^$\s]+\$([A-Za-z0-9_-]+)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(report))) out.add(m[1].toLowerCase());
  return Array.from(out);
}

/**
 * Blame seeds for a boot failure the crash-report parser can't attribute to a
 * jar. Every shape here was seen live on v0.5.13/14 installs (Society: Sunlit
 * Valley's client-heavy manifest):
 * - mixin handler frames name the owning mixin config namespace ("etf") —
 *   trusted only with client-dist evidence in the output;
 * - FML named errors ("<Mod> has class loading errors", e.g. Oculus);
 * - missing dependencies after an exclusion ("Mod colorwheel requires
 *   oculus ...") — the REQUIRING mod goes, its dep was removed deliberately;
 * - mod construction / auto-subscriber failures ("Failed to create mod
 *   instance. ModID: watermedia" — WATERMeDIA refuses servers; "Failed to
 *   register automatic subscribers. ModID: create");
 * - root-cause stack-frame jar annotations ("~[869524.jar%23NNN...").
 * Color codes (§0-§f) are stripped first — FML interleaves them with mod ids.
 * Returns files in mods/ (basenames); empty when nothing maps.
 */
export function blameModsFromOutput(
  output: string,
  modsByIdentifier: Map<string, string>,
): string[] {
  const clean = output.replace(/§./g, "");
  const hit = new Set<string>();
  const add = (ids: string[]) => {
    for (const id of ids) {
      const f = modsByIdentifier.get(id.toLowerCase());
      if (f) hit.add(f);
    }
  };
  const classLoad: RegExpExecArray[] = [];
  let m6: RegExpExecArray | null;
  const re6 = /([A-Za-z0-9_]+) has class loading errors/g;
  while ((m6 = re6.exec(clean))) classLoad.push(m6);
  add(classLoad.map((m) => m[1]));
  const requires: RegExpExecArray[] = [];
  const re7 = /Mod ([a-z0-9_]+) requires ([a-z0-9_]+)/g;
  while ((m6 = re7.exec(clean))) requires.push(m6);
  add(requires.map((m) => m[1]));
  const modIds: RegExpExecArray[] = [];
  const re8 = /Failed to (?:create mod instance|register automatic subscribers)\. ModID: ([A-Za-z0-9_-]+)/g;
  while ((m6 = re8.exec(clean))) modIds.push(m6);
  add(modIds.map((m) => m[1]));
  if (CLIENT_DIST_EVIDENCE.test(clean)) add(parseMixinHandlerModIds(clean));
  const rootCause = clean.slice(clean.lastIndexOf("Caused by:"));
  const re9 = /~\[(\d+)\.jar%/g;
  while ((m6 = re9.exec(rootCause))) hit.add(`${m6[1]}.jar`);
  const names = new Set(Array.from(hit).map((f) => path.basename(f)));
  return Array.from(names);
}

/**
 * Map every jar in mods/ to its identifiers: Forge/NeoForge/Fabric modIds and
 * mixin config namespaces (the handler-frame segment can be either — live
 * case: modId entity_texture_features, config mixins.etf.common.json →
 * "etf"). Side segments (mixins/common/client/...) are ignored.
 */
export function modIdentifierIndex(serverRoot: string): Map<string, string> {
  const byId = new Map<string, string>();
  const modsDir = path.join(serverRoot, "mods");
  const SIDES = new Set(["mixins", "common", "client", "server", "main", "forge", "fabric", "neoforge", "quilt"]);
  for (const name of listModsJarNames(serverRoot)) {
    const file = path.join(modsDir, name);
    const ids = scanJarClientSignals(file).allModIds.map((i) => i.toLowerCase());
    try {
      const zip = new AdmZip(file);
      for (const e of zip.getEntries()) {
        if (!/(^|\/)[^/]*mixins[^/]*\.json$/i.test(e.entryName)) continue;
        const base = path.basename(e.entryName).replace(/\.json$/i, "");
        for (const seg of base.split(".")) {
          if (seg && !SIDES.has(seg.toLowerCase())) ids.push(seg.toLowerCase());
        }
      }
    } catch { /* unreadable jar — modId index only */ }
    for (const id of ids) if (!byId.has(id)) byId.set(id, file);
  }
  return byId;
}

/**
 * Version-range self-heal: replace the named dependency with the same
 * project's newest build for the server's loader + Minecraft version (live
 * fix: modern_industrialization 2.5.10 → 2.5.11 satisfied tesseract_api).
 * Jars are keyed by numeric project id; anything else (manual installs) is
 * skipped. Returns true when at least one jar was replaced.
 */
async function bumpDependenciesForRangeErrors(args: {
  serverRoot: string;
  pairs: { requiring: string; required: string }[];
  bumpedDeps: Set<string>;
  warnings: string[];
  loader: TargetLoader | null;
  mcVersion: string | null;
  onProgress?: (label: string) => void;
}): Promise<boolean> {
  const { serverRoot, pairs, bumpedDeps, warnings, loader, mcVersion } = args;
  if (!loader || !mcVersion) return false;
  const modsDir = path.join(serverRoot, "mods");
  // modId → jar file (multi-mod jars register every modId they provide).
  const byModId = new Map<string, string>();
  for (const name of listModsJarNames(serverRoot)) {
    const signals = scanJarClientSignals(path.join(modsDir, name));
    for (const id of signals.allModIds) {
      if (!byModId.has(id)) byModId.set(id, name);
    }
  }
  let replaced = false;
  for (const { requiring, required } of pairs) {
    if (bumpedDeps.has(required)) continue;
    bumpedDeps.add(required);
    const jarName = byModId.get(required);
    if (!jarName) continue;
    const projectId = path.basename(jarName, ".jar");
    if (!/^\d+$/.test(projectId)) continue;
    try {
      const build = await fetchLoaderBuild(Number(projectId), mcVersion, loader);
      if (!build) continue;
      await downloadFile(curseForgeDownloadUrl(build), path.join(modsDir, jarName), { onProgress: () => {} });
      warnings.push(
        `Upgraded '${required}' (${jarName}) to '${build.displayName || build.fileName}' to satisfy '${requiring}' — the pack pinned an older build.`
      );
      args.onProgress?.(`Upgrading ${required} for ${requiring} — retrying boot`);
      replaced = true;
    } catch {
      // no CF project / no build / download failed — the caller falls back
      // to quarantining the mod that imposes the range
    }
  }
  return replaced;
}

/**
 * Run the boot test; when FML names a mod in a crash report, quarantine it
 * (+ its required dependents within mods/) and retry. Version-range
 * failures are healed by bumping the named dependency first (one attempt
 * per dependency — if the crash repeats, the mod that imposes the range is
 * quarantined instead). Throws the original error when the crash names no
 * jar and no range pair, or the cap is exhausted. Returns the basenames of
 * every jar removed, so callers can clean up install rows (CF and mrpack
 * rows are both keyed by jar basename).
 */
export async function testServerBootWithQuarantine(args: {
  serverId: string;
  serverRoot: string;
  game: string;
  warnings: string[];
  onProgress?: (label: string) => void;
  /** Overrides for tests: delete-retry waits and the java-label probe. */
  deps?: { deleteDelaysMs?: number[]; javaExe?: string };
}): Promise<string[]> {
  const { serverId, serverRoot, game, warnings, onProgress } = args;
  const removed: string[] = [];
  const bumpedDeps = new Set<string>();

  // Always say which java the verification will run on. The packaged app's
  // console is invisible, and the v0.5.8 incident (a PATH-only lookup that
  // silently skipped every boot test) was only diagnosed from screenshots —
  // this line makes "ran" vs "skipped" a fact in the response itself.
  const javaExe = args.deps?.javaExe ?? resolveSandboxJava(serverRoot);
  warnings.push(
    `Boot test: ${javaExe === "java" ? "running on the system PATH java" : `running on the bundled runtime (${javaExe})`}`
  );

  for (let round = 0; ; round++) {
    try {
      await testServerBoot(serverId, game);
      return removed;
    } catch (err) {
      if (!(err instanceof SandboxBootError) || round >= MAX_QUARANTINE_ROUNDS) throw err;
      // Prefer the crash report (full text); fall back to the captured tail.
      const reportPath = newestCrashReport(serverRoot);
      const report = reportPath ? fs.readFileSync(reportPath, "utf8") : err.output;
      const loader = serverLoaderType(serverRoot);
      const mcVersion = serverMinecraftVersion(serverRoot);

      // Version-range failures first: bump the dependency the pack pinned
      // too old. One attempt per dependency; a repeat crash quarantines the
      // mod that imposes the range instead (below).
      const rangePairs = parseRangeErrors(report);
      if (rangePairs.length > 0) {
        const fresh = rangePairs.filter((p) => !bumpedDeps.has(p.required));
        if (
          fresh.length > 0 &&
          (await bumpDependenciesForRangeErrors({
            serverRoot, pairs: fresh, bumpedDeps, warnings, loader, mcVersion, onProgress,
          }))
        ) {
          continue;
        }
        // Bump unavailable or already tried — drop the mod that demands the
        // range so the rest of the pack can boot.
        const candidates: ExclusionCandidate[] = listModsJarNames(serverRoot).map((name) => ({
          file: path.join(serverRoot, "mods", name),
          signals: scanJarClientSignals(path.join(serverRoot, "mods", name)),
        }));
        const seeds = candidates.filter((c) =>
          rangePairs.some((p) => c.signals.allModIds.includes(p.requiring))
        );
        if (seeds.length === 0) throw err;
        const { excluded, reasons } = planClientExclusions(candidates, new Set(seeds.map((s) => s.file)), {
          targetLoader: loader,
        });
        if (excluded.length === 0) throw err;
        for (const c of excluded) {
          if (!(await forceRemoveJar(c.file, args.deps?.deleteDelaysMs))) {
            warnings.push(
              `Could not remove '${path.basename(c.file)}' — Windows held the file through every retry. ` +
                "The install cannot be verified while that jar is locked; wait a minute and reinstall the modpack."
            );
            throw err;
          }
          removed.push(path.basename(c.file));
          warnings.push(
            `Excluded '${path.basename(c.file)}' — ${reasons.get(c.file) ?? "it demands a dependency version the pack doesn't ship"}.`
          );
        }
        onProgress?.("Excluding out-of-range mod(s) — retrying boot");
        continue;
      }

      const blamed = blamedModFiles(report);
      // Signals for every jar currently in mods/ — the closure needs the
      // whole graph to pull in required dependents of the blamed jars.
      const candidates: ExclusionCandidate[] = listModsJarNames(serverRoot).map((name) => ({
        file: path.join(serverRoot, "mods", name),
        signals: scanJarClientSignals(path.join(serverRoot, "mods", name)),
      }));
      let seeds = candidates.filter((c) => blamed.includes(path.basename(c.file)));

      // No jar named anywhere: the boot output still names the culprit by
      // mod id or stack-frame jar (mixin handlers, construction failures,
      // missing deps after an exclusion, class-load errors).
      let outputBlameNote: string | null = null;
      if (seeds.length === 0) {
        const outputBlamed = blameModsFromOutput(report, modIdentifierIndex(serverRoot));
        if (outputBlamed.length > 0) {
          seeds = candidates.filter((c) => outputBlamed.includes(path.basename(c.file)));
          if (seeds.length > 0) {
            outputBlameNote = `The boot output implicates ${outputBlamed.join(", ")} with no jar named in a crash report — excluding their jar(s).`;
          }
        }
      }

      if (seeds.length === 0) throw err;
      if (outputBlameNote) warnings.push(outputBlameNote);

      const { excluded, reasons } = planClientExclusions(candidates, new Set(seeds.map((s) => s.file)), {
        targetLoader: loader,
      });
      if (excluded.length === 0) throw err;

      for (const c of excluded) {
        if (!(await forceRemoveJar(c.file, args.deps?.deleteDelaysMs))) {
          warnings.push(
            `Could not remove '${path.basename(c.file)}' — Windows held the file through every retry. ` +
              "The install cannot be verified while that jar is locked; wait a minute and reinstall the modpack."
          );
          throw err;
        }
        removed.push(path.basename(c.file));
        warnings.push(
          `Excluded '${path.basename(c.file)}' — ${reasons.get(c.file) ?? "client-only mod that crashed the boot test"}.`
        );
      }
      onProgress?.(`Excluding ${blamed.join(", ")} — retrying boot without ${blamed.length === 1 ? "it" : "them"}`);
    }
  }
}
