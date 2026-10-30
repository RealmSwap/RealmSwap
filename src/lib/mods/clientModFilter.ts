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
 * 3. Not mods at all: packs bundle shader/resource packs for clients, and a
 *    zip without a mod manifest in mods/ is rejected by FML outright
 *    ("File X is not a valid mod file") — a boot-fatal crash.
 * 4. Wrong loader: packs pin Fabric/legacy-Forge builds of mods alongside
 *    (or instead of) the loader the pack runs. FML refuses them
 *    ("is a Fabric mod and cannot be loaded" / "for Minecraft Forge or an
 *    older version of NeoForge"). When the caller knows the server's loader,
 *    cross-loader jars are dropped up front so the pack's correct-loader
 *    files are what the boot test sees.
 *
 * Deliberately NOT flagged as broken: FMLModType: LIBRARY jars (language
 * providers like Scala/Kotlin bindings — manifest-less by design) and
 * jarjar wrappers (META-INF/jarjar/metadata.json — NeoForge loads the
 * nested mods). Both are manifest-less and boot-healthy; a naive
 * "no manifest = not a mod" rule would break packs that ship them.
 *
 * This module handles cases 1, 3 and 4 statically BEFORE the boot test: scan
 * the downloaded jars, exclude early-window seeds, manifest-less jars and
 * cross-loader jars, and close over jars whose REQUIRED toml dependencies
 * reference an excluded mod (optional dependencies like Create→sodium are
 * deliberately left alone — verified server-safe without it).
 */

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

export interface JarClientSignals {
  selfModId: string | null;
  /** Every [[mods]] modId across the jar's tomls + the fabric/quilt manifest
   *  id — multi-mod jars list several. */
  allModIds: string[];
  /** Declares a neoforgespi.earlywindow (or legacy fml earlywindow) service. */
  hasEarlyWindowService: boolean;
  /** Carries any Fabric/NeoForge/Quilt mod manifest — without one FML refuses the jar. */
  hasModManifest: boolean;
  /** Side declaration from the jar's OWN manifest (fabric/quilt `environment`,
   *  forge/neo `clientSideOnly=true`): the authoritative answer to "does this
   *  jar run on a dedicated server". "unknown" only for manifest-less jars.
   *  A jar declaring both sides must never be swept as client-only — mods
   *  like Friends For Life ship client-side pack flags but register server
   *  channels, and dropping them kicks every joining client at handshake. */
  sides: "both" | "client" | "unknown";
  /** The zip itself couldn't be parsed (duplicate entries, truncation…). */
  unreadableZip: boolean;
  /** Which loader manifests the jar carries: neoforge.mods.toml → "neoforge",
   *  fabric/quilt json → those, plain mods.toml or mcmod.info → "forge"/"legacy-forge".
   *  Dual-manifest jars list several; FML loads whichever side matches. */
  loaders: Set<JarLoader>;
  /** FMLModType: LIBRARY jar (language providers like Scala/Kotlin bindings).
   *  Manifest-less on purpose — FML loads these from mods/ directly. */
  fmlLibrary: boolean;
  /** A jarjar wrapper (META-INF/jarjar/metadata.json): NeoForge loads the
   *  nested mods, so the outer jar needs no manifest of its own. */
  jarJarWrapper: boolean;
  /** modIds of REQUIRED dependencies parsed from the embedded mods toml. */
  requiredDeps: Set<string>;
}

export type JarLoader = "neoforge" | "forge" | "legacy-forge" | "fabric" | "quilt";
export type TargetLoader = "neoforge" | "forge" | "fabric" | "quilt";

/** Which jar-level loader manifests a server loader can actually load. */
const LOADER_FAMILY: Record<TargetLoader, JarLoader[]> = {
  neoforge: ["neoforge"],
  // Modern NeoForge refuses legacy mods.toml jars ("for Minecraft Forge or an
  // older version of NeoForge"), but a Forge server loads them.
  forge: ["forge", "legacy-forge"],
  fabric: ["fabric", "quilt"],
  quilt: ["quilt", "fabric"],
};

export function loaderAcceptsJar(target: TargetLoader, jarLoaders: Set<JarLoader>): boolean {
  if (jarLoaders.size === 0) return true; // no signal — not this rule's call
  return Array.from(jarLoaders).some((l) => LOADER_FAMILY[target].includes(l));
}

const MODS_TOML_RE = /neoforge\.mods\.toml$|(^|\/)mods\.toml$/;
const MOD_MANIFEST_RE =
  /neoforge\.mods\.toml$|(^|\/)mods\.toml$|(^|\/)fabric\.mod\.json$|(^|\/)quilt\.mod\.json$|(^|\/)mcmod\.info$/;

/** Loader/vanilla ids that appear in dependency blocks but are never jars in
 *  mods/ — a misparsed modId must never poison the closure through them. */
const VANILLA_DEP_IDS = new Set([
  "minecraft", "java", "fabricloader", "quilt_loader", "forgelang", "javafml",
  "forge", "neoforge", "legacyforge", "minecraftserver",
]);

/** Read client-risk signals from one jar on disk. Tolerates broken jars. */
export function scanJarClientSignals(jarPath: string): JarClientSignals {
  const signals: JarClientSignals = {
    selfModId: null,
    allModIds: [],
    hasEarlyWindowService: false,
    hasModManifest: false,
    sides: "unknown",
    unreadableZip: false,
    loaders: new Set(),
    fmlLibrary: false,
    jarJarWrapper: false,
    requiredDeps: new Set(),
  };
  let zip: AdmZip;
  try {
    zip = new AdmZip(jarPath);
    // adm-zip parses lazily: the duplicate-entry-name rejection from
    // GHSA-p634-w6r4-rjp2 fires on the first entries access, not in the
    // constructor. Force the parse inside this guard so a jar with
    // duplicated entries (legal in shade-built jars) degrades to "no
    // signals" — the boot test still covers it — instead of failing the
    // whole pack install.
    zip.getEntries();
  } catch {
    signals.unreadableZip = true;
    return signals;
  }
  // Side declarations seen so far: every manifest votes, and the jar counts
  // as client-only only when EVERY manifest declares it client-only.
  let sideVotes: Array<"both" | "client"> = [];
  const addSide = (side: "both" | "client") => {
    sideVotes.push(side);
    signals.sides = sideVotes.every((s) => s === "client") ? "client" : "both";
  };
  for (const entry of zip.getEntries()) {
    const name = entry.entryName;
    if (name.startsWith("META-INF/services/") && name.toLowerCase().includes("earlywindow")) {
      signals.hasEarlyWindowService = true;
    }
    if (name === "META-INF/MANIFEST.MF") {
      const manifest = zip.readAsText(entry);
      if (/FMLModType\s*:\s*LIBRARY/i.test(manifest)) signals.fmlLibrary = true;
    }
    if (name === "META-INF/jarjar/metadata.json") {
      signals.jarJarWrapper = true;
    }
    if (/(^|\/)fabric\.mod\.json$/i.test(name) || /(^|\/)quilt\.mod\.json$/i.test(name)) {
      let fm: any;
      try {
        fm = JSON.parse(zip.readAsText(entry));
      } catch {
        fm = null;
      }
      if (fm && typeof fm.id === "string") {
        const id = fm.id.toLowerCase();
        if (!signals.allModIds.includes(id)) signals.allModIds.push(id);
      }
      // The loader's own default for an absent environment is both sides.
      addSide(fm?.environment === "client" ? "client" : "both");
    }
    if (MOD_MANIFEST_RE.test(name)) {
      signals.hasModManifest = true;
      if (/neoforge\.mods\.toml$/i.test(name)) signals.loaders.add("neoforge");
      else if (/fabric\.mod\.json$/i.test(name)) signals.loaders.add("fabric");
      else if (/quilt\.mod\.json$/i.test(name)) signals.loaders.add("quilt");
      else if (/mcmod\.info$/i.test(name)) signals.loaders.add("legacy-forge");
      else signals.loaders.add("forge");
    }
    if (MODS_TOML_RE.test(name)) {
      let data: string;
      try {
        data = zip.readAsText(entry);
      } catch {
        continue;
      }
      // Every [[mods]] block — multi-mod jars (a toml with two [[mods]])
      // provide more than one modId, and dep-resolution needs them all.
      // modIds come ONLY from [[mods]] blocks: taking the first `modId=`
      // anywhere reads [[dependencies.minecraft]] when a toml declares its
      // dependencies first, and a jar whose modId parses as "minecraft" (or
      // "collective") poisons the closure — every jar requiring it gets
      // swept (live: the Homestead 2.0.1 install lost ~25 server-safe mods).
      const modsSplit = data.split(/(?=\[\[mods\]\])/);
      for (const modsBlock of modsSplit) {
        if (!modsBlock.startsWith("[[mods]]")) continue;
        const mm = /^\[\[mods\]\][\s\S]*?modId\s*=\s*["']([\w-]+)["']/.exec(modsBlock);
        if (mm) {
          const id = mm[1].toLowerCase();
          if (!signals.allModIds.includes(id)) signals.allModIds.push(id);
        }
      }
      // A hybrid jar's toml counts as a side vote too; clientSideOnly=true
      // is Forge's own client-only declaration.
      addSide(/clientSideOnly\s*=\s*true/.test(data) ? "client" : "both");
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
  if (signals.allModIds.length > 0) signals.selfModId = signals.allModIds[0];
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
  forceExclude?: Set<string>,
  opts?: { targetLoader?: TargetLoader | null }
): { excluded: ExclusionCandidate[]; reasons: Map<string, string> } {
  const excluded = new Set<ExclusionCandidate>();
  const reasons = new Map<string, string>();
  const excludedModIds = new Set<string>();
  const target = opts?.targetLoader ?? null;

  const modIdOf = (c: ExclusionCandidate) => c.signals.selfModId;

  for (const c of candidates) {
    if (forceExclude?.has(c.file)) {
      excluded.add(c);
      reasons.set(
        c.file,
        c.signals.loaders.size > 0 && target && !loaderAcceptsJar(target, c.signals.loaders)
          ? `built for ${Array.from(c.signals.loaders).join("/")} — it can't load on a ${target} server`
          : c.signals.hasModManifest || c.signals.unreadableZip
            ? "crashed the boot test (client-only mod)"
            : "isn't a valid mod file — FML rejected it outright"
      );
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
      continue;
    }
    if (target && !loaderAcceptsJar(target, c.signals.loaders)) {
      excluded.add(c);
      reasons.set(
        c.file,
        `built for ${Array.from(c.signals.loaders).join("/")} — it can't load on a ${target} server (FML refuses cross-loader jars)`
      );
      continue;
    }
    if (c.signals.sides === "client") {
      excluded.add(c);
      reasons.set(
        c.file,
        "declares itself client-only in its own manifest (fabric environment / clientSideOnly) — it would never load on the dedicated server"
      );
      continue;
    }
    if (
      !c.signals.hasModManifest &&
      !c.signals.unreadableZip &&
      !c.signals.fmlLibrary &&
      !c.signals.jarJarWrapper
    ) {
      excluded.add(c);
      reasons.set(
        c.file,
        "isn't a mod file at all — it carries no Fabric/NeoForge mod manifest (usually a shader or resource pack bundled for clients), and FML refuses it"
      );
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const c of candidates) {
      if (excluded.has(c)) continue;
      const hit = Array.from(c.signals.requiredDeps).find(
        (dep) => excludedModIds.has(dep) && !VANILLA_DEP_IDS.has(dep)
      );
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
