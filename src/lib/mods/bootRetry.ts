/**
 * Boot-test retry for Minecraft modpack installs. Client-only mods that slip
 * past the static filter (clientModFilter.ts) die during mod construction
 * with a named crash report ("Mod loading issue for: X / Mod file: X.jar").
 * This helper wraps testServerBoot: on failure it reads the newest crash
 * report, quarantines the named jar (plus anything in the pack that
 * REQUIRES it), and retries — up to a small cap. Each exclusion surfaces as
 * a warning so the user sees exactly what was left out and why.
 */

import fs from "fs";
import path from "path";
import { dataRoot } from "@/lib/appPaths";
import { testServerBoot, SandboxBootError, resolveSandboxJava } from "@/lib/runners/sandbox";
import { planClientExclusions, scanJarClientSignals, type ExclusionCandidate } from "@/lib/mods/clientModFilter";

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

/** The jar FML blames in a crash report ("Mod file: mods/foo-1.0.jar"). */
function blamedModFile(report: string): string | null {
  const m = /Mod file: ([^\r\n]+?\.jar)/.exec(report);
  return m ? path.basename(m[1]) : null;
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

/**
 * Run the boot test; when FML names a mod in a crash report, quarantine it
 * (+ its required dependents within mods/) and retry. Throws the original
 * error when the crash names no jar or the cap is exhausted. Returns the
 * basenames of every jar removed, so callers can clean up install rows
 * (CF and mrpack rows are both keyed by jar basename).
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
      const blamed = blamedModFile(report);
      if (!blamed) throw err;

      // Signals for every jar currently in mods/ — the closure needs the
      // whole graph to pull in required dependents of the blamed jar.
      const candidates: ExclusionCandidate[] = listModsJarNames(serverRoot).map((name) => ({
        file: path.join(serverRoot, "mods", name),
        signals: scanJarClientSignals(path.join(serverRoot, "mods", name)),
      }));
      const seed = candidates.find((c) => path.basename(c.file) === blamed);
      if (!seed) throw err;

      const { excluded, reasons } = planClientExclusions(candidates, new Set([seed.file]));
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
      onProgress?.(`Excluding ${blamed} — retrying boot without it`);
    }
  }
}
