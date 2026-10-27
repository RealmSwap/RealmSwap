/**
 * Client-mod exclusion for Minecraft pack installs. Client-only mods inside
 * CurseForge modpacks crash dedicated servers in two proven ways:
 *
 * 1. Pre-launch: a jar declaring a NeoForge early-window service
 *    (META-INF/services/net.neoforged.neoforgespi.earlywindow.*) is invoked
 *    by FML's ImmediateWindowHandler on ANY distribution; Sodium's service
 *    loads org.lwjgl.Version, which only exists on clients
 *    (ClassNotFoundException at boot).
 * 2. During construction: client-only mods load net.minecraft.client.*
 *    classes and die with "invalid dist DEDICATED_SERVER" (e.g. Dark Mode
 *    Everywhere). FML's crash report names the mod file, so the boot-retry
 *    loop (quarantineExcludedMod) handles those at install time.
 *
 * This module handles case 1 statically BEFORE the boot test: scan the
 * downloaded jars, exclude early-window seeds, and close over jars whose
 * REQUIRED toml dependencies reference an excluded mod (optional
 * dependencies like Create→sodium are deliberately left alone — verified
 * server-safe without it).
 */

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

export interface JarClientSignals {
  selfModId: string | null;
  /** Declares a neoforgespi.earlywindow (or legacy fml earlywindow) service. */
  hasEarlyWindowService: boolean;
  /** modIds of REQUIRED dependencies parsed from the embedded mods toml. */
  requiredDeps: Set<string>;
}

const MODS_TOML_RE = /neoforge\.mods\.toml$|(^|\/)mods\.toml$/;

/** Read client-risk signals from one jar on disk. Tolerates broken jars. */
export function scanJarClientSignals(jarPath: string): JarClientSignals {
  const signals: JarClientSignals = { selfModId: null, hasEarlyWindowService: false, requiredDeps: new Set() };
  let zip: AdmZip;
  try {
    zip = new AdmZip(jarPath);
  } catch {
    return signals;
  }
  for (const entry of zip.getEntries()) {
    const name = entry.entryName;
    if (name.startsWith("META-INF/services/") && name.toLowerCase().includes("earlywindow")) {
      signals.hasEarlyWindowService = true;
    }
    if (MODS_TOML_RE.test(name)) {
      let data: string;
      try {
        data = zip.readAsText(entry);
      } catch {
        continue;
      }
      if (signals.selfModId === null) {
        const m = /(?:^|\n)\s*modId\s*=\s*["']([\w-]+)["']/.exec(data);
        if (m) signals.selfModId = m[1].toLowerCase();
      }
      // [[dependencies.<target>]] blocks: the body's modId is the dependency.
      const split = data.split(/(?=\[\[dependencies\.[\w-]+\]\])/);
      for (const block of split) {
        const body = block.replace(/^\[\[dependencies\.[\w-]+\]\]/, "");
        if (!block.startsWith("[[dependencies.")) continue;
        const id = /modId\s*=\s*["']([\w-]+)["']/.exec(body);
        if (!id) continue;
        const type = /type\s*=\s*["'](\w+)["']/.exec(body);
        const mandatory = /mandatory\s*=\s*(true|false)/.exec(body);
        const required =
          type?.[1] === "required" || mandatory?.[1] === "true" || (!type && !mandatory);
        if (required) signals.requiredDeps.add(id[1].toLowerCase());
      }
    }
  }
  return signals;
}

export interface ExclusionCandidate {
  /** Absolute jar path. */
  file: string;
  /** Pack-owned packageId (row key) when the jar came from this install. */
  packageId?: string;
  signals: JarClientSignals;
}

/**
 * Compute the exclusion set: every seed jar (early-window service, or forced
 * by the caller — e.g. a crash-report blame) plus, transitively, any
 * candidate whose REQUIRED dependencies reference an already-excluded mod.
 * Returns the excluded files and a per-file reason.
 */
export function planClientExclusions(
  candidates: ExclusionCandidate[],
  forceExclude?: Set<string>
): { excluded: ExclusionCandidate[]; reasons: Map<string, string> } {
  const excluded = new Set<ExclusionCandidate>();
  const reasons = new Map<string, string>();
  const excludedModIds = new Set<string>();

  const modIdOf = (c: ExclusionCandidate) => c.signals.selfModId;

  for (const c of candidates) {
    if (forceExclude?.has(c.file)) {
      excluded.add(c);
      reasons.set(c.file, "crashed the boot test (client-only mod)");
      if (modIdOf(c)) excludedModIds.add(modIdOf(c)!);
      continue;
    }
    if (c.signals.hasEarlyWindowService) {
      excluded.add(c);
      reasons.set(
        c.file,
        "client-only rendering mod — it declares a client display service that crashes dedicated servers at boot"
      );
      if (modIdOf(c)) excludedModIds.add(modIdOf(c)!);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const c of candidates) {
      if (excluded.has(c)) continue;
      const hit = Array.from(c.signals.requiredDeps).find((dep) => excludedModIds.has(dep));
      if (hit) {
        excluded.add(c);
        reasons.set(c.file, `requires ${hit} (excluded as client-only)`);
        const mid = modIdOf(c);
        if (mid) {
          excludedModIds.add(mid);
        }
        changed = true;
      }
    }
  }

  return { excluded: Array.from(excluded), reasons };
}

/**
 * Remove an excluded jar from the server's mods dir (used by both the static
 * pass and the boot-retry quarantine). Best-effort row cleanup is the
 * caller's job (it owns the prisma keying).
 */
export function removeModJar(serverRoot: string, fileName: string): void {
  try {
    fs.unlinkSync(path.join(serverRoot, "mods", fileName));
  } catch {
    /* already gone */
  }
}
