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
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { planClientExclusions, scanJarClientSignals, type ExclusionCandidate } from "@/lib/mods/clientModFilter";

const MAX_QUARANTINE_ROUNDS = 3;

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
}): Promise<string[]> {
  const { serverId, serverRoot, game, warnings, onProgress } = args;
  const removed: string[] = [];

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
        try { fs.rmSync(c.file, { force: true }); } catch {}
        removed.push(path.basename(c.file));
        warnings.push(
          `Excluded '${path.basename(c.file)}' — ${reasons.get(c.file) ?? "client-only mod that crashed the boot test"}.`
        );
      }
      onProgress?.(`Excluding ${blamed} — retrying boot without it`);
    }
  }
}
