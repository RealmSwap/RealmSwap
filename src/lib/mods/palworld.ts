/**
 * Palworld UE4SS mod support via the Thunderstore unreal_shimloader package.
 *
 * Ground truths probed live 2026-10-24 (shimloader 1.1.7 zip + README):
 *
 * - shimloader is a shim for RE-UE4SS that virtualizes the game's filesystem
 *   so mods can live OUTSIDE the game directory. It is driven entirely by
 *   manager-passed launch arguments:
 *     --mod-dir     one or more ue4ss lua/dll mod dirs  (maps to GAME/Binaries/Win64/Mods)
 *     --pak-dir     blueprint .pak mods                 (maps to GAME/Content/Paks/LogicMods)
 *     --cfg-dir     .cfg config files                   (maps to GAME/Config)
 *     --overlay-dir wrapper-package dirs whose trees are overlaid onto GAME/Binaries/Win64
 *   Without these arguments the shim loads but does nothing — the arguments
 *   are injected by LocalRunner when the core's marker exists.
 * - The shimloader zip itself (dwmapi.dll proxy + the whole UE4SS/ bundle)
 *   is an "overlay wrapper": its files land in the overlay dir and are
 *   overlaid onto Pal/Binaries/Win64 at boot.
 * - Probed Palworld packages ship three layout conventions:
 *     1. `mod/` root      — one ue4ss mod (enabled.txt, dlls/, scripts/)
 *     2. `pak/` root      — blueprint paks plus sibling data folders
 *     3. game-rooted      — real game paths like Pal/Binaries/Win64/Mods/<Name>/
 *       and Pal/Content/Paks/LogicMods/ (e.g. PalModders-BasesPlus)
 *   A package may mix conventions (mod/ + pak/). Files outside these
 *   conventions (Windows installers, Sources/, loose uassets) are refused —
 *   guessing where they belong would silently break the game.
 * - Whether a mod actually works on a DEDICATED server cannot be read from
 *   the zip (the community publishes client-only and server/client mods
 *   alike) — the sandbox boot test + rollback is the gate, same as
 *   CurseForge's design.
 */

import fs from "fs";
import path from "path";
import type AdmZip from "adm-zip";
import { safeJoin } from "@/lib/safePath";

/** The community's UE4SS framework package (overlay wrapper). */
export const SHIMLOADER_PACKAGE_ID = "Thunderstore-unreal_shimloader";

/** Manager-owned dirs under palworld-server/, wired to the shimloader args. */
export const PALWORLD_MODS_DIR = "mods";
export const PALWORLD_PAKS_DIR = "paks";
export const PALWORLD_CFGS_DIR = "cfgs";
export const PALWORLD_OVERLAY_DIR = "overlay";

/** Marker proving the shimloader core (dwmapi.dll proxy + UE4SS) is installed. */
export function shimloaderMarkerPath(palworldDir: string): string {
  return path.join(palworldDir, PALWORLD_OVERLAY_DIR, SHIMLOADER_PACKAGE_ID, "dwmapi.dll");
}

/** Per-package uninstall manifests (installed file lists) live here. */
export function palworldManifestDir(palworldDir: string): string {
  return path.join(palworldDir, ".realmswap");
}

/** Absolute --mod-dir/--pak-dir/--cfg-dir/--overlay-dir arguments for a boot. */
export function shimloaderLaunchArgs(palworldDir: string): string[] {
  const abs = (rel: string) => path.join(palworldDir, rel);
  return [
    `--mod-dir=${abs(PALWORLD_MODS_DIR)}`,
    `--pak-dir=${abs(PALWORLD_PAKS_DIR)}`,
    `--cfg-dir=${abs(PALWORLD_CFGS_DIR)}`,
    `--overlay-dir=${abs(PALWORLD_OVERLAY_DIR)}`,
  ];
}

export interface PalworldFilePlan {
  /** Zip entry name. */
  entry: string;
  /** Destination path relative to palworld-server/. */
  destRel: string;
}

export interface PalworldPackagePlan {
  files: PalworldFilePlan[];
  /** Where uninstall bookkeeping lives (relative to palworldDir). */
  manifestRel: string;
}

const METADATA_FILES = new Set(["icon.png", "manifest.json", "readme.md", "license.md", "changelog.md"]);

/**
 * Where a package entry goes. null = thunderstore metadata (skip).
 * Throws with an honest message for anything unmappable.
 */
function mapPalworldEntry(entry: string, packageName: string, fullName: string): PalworldFilePlan | null {
  const norm = entry.split("\\").join("/");
  const lower = norm.toLowerCase();
  // By basename: Thunderstore also drops metadata files nested in wrapper
  // folders, and a nested docs file would otherwise fail layout classification.
  const base = lower.slice(lower.lastIndexOf("/") + 1);
  if (METADATA_FILES.has(base)) return null;
  if (/\.(msi|exe)$/i.test(norm)) {
    throw new Error(
      `Package ships a Windows installer (${norm}) instead of mod files — it can't be installed on a server.`
    );
  }

  // Convention 1: `mod/` root — one ue4ss mod named after the package.
  if (norm === "mod" || norm.startsWith("mod/")) {
    const rest = norm === "mod" ? "" : norm.slice("mod/".length);
    return { entry, destRel: path.posix.join(PALWORLD_MODS_DIR, packageName, rest) };
  }

  // Convention 2: `pak/` root — paks and their sibling data folders.
  if (norm === "pak" || norm.startsWith("pak/")) {
    const rest = norm === "pak" ? "" : norm.slice("pak/".length);
    return { entry, destRel: path.posix.join(PALWORLD_PAKS_DIR, rest) };
  }

  // Convention 3: game-rooted trees. The mods/paks subtrees map into the
  // manager dirs (shimloader virtualizes those game paths); Win64-rooted
  // files outside Mods/ are overlay wrapper material. All case-insensitive:
  // packages in the wild mix Palmodders' casing conventions.
  const win64Mods = /^pal\/binaries\/win64\/mods\/(.+)$/i.exec(norm);
  if (win64Mods) {
    // A game-rooted package names its mod dir itself (e.g. Mods/BasesPlus/).
    return { entry, destRel: path.posix.join(PALWORLD_MODS_DIR, win64Mods[1]) };
  }
  if (/^pal\/content\/paks\/logicmods\//i.test(norm)) {
    const rest = norm.slice("Pal/Content/Paks/LogicMods/".length);
    return { entry, destRel: path.posix.join(PALWORLD_PAKS_DIR, rest) };
  }
  if (/^pal\/binaries\/win64\//i.test(norm)) {
    const rest = norm.slice("Pal/Binaries/Win64/".length);
    return { entry, destRel: path.posix.join(PALWORLD_OVERLAY_DIR, fullName, rest) };
  }
  if (/^pal\/config\//i.test(norm)) {
    const rest = norm.slice("Pal/Config/".length);
    return { entry, destRel: path.posix.join(PALWORLD_CFGS_DIR, rest) };
  }

  throw new Error(
    `Unrecognized file layout: '${norm}' is not a mod/, pak/, Pal/... package path RealmSwap knows how to install.`
  );
}

/**
 * Plan where every entry of a Palworld package zip lands. Throws
 * (honestly, before anything is written) when the layout is not one of the
 * known conventions.
 */
export function planPalworldPackage(args: {
  zip: AdmZip;
  /** Thunderstore full name ("localcc-HelloWorld") — overlay wrapper dir name. */
  fullName: string;
  /** The package's own name ("HelloWorld") — the ue4ss mod dir name for mod/ roots. */
  packageName: string;
}): PalworldPackagePlan {
  const { zip, fullName, packageName } = args;
  const files: PalworldFilePlan[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const mapped = mapPalworldEntry(entry.entryName, packageName, fullName);
    if (mapped) files.push(mapped);
  }
  if (files.length === 0) {
    throw new Error("Package contains no mod files RealmSwap recognizes (only metadata).");
  }
  return {
    files,
    manifestRel: path.posix.join(".realmswap", `${fullName}.json`),
  };
}

/**
 * Extract a planned package: every planned entry is re-anchored via safeJoin
 * (per-entry, so a hostile archive can't escape the server dir), and a
 * manifest of installed paths is written for uninstall.
 */
export function applyPalworldPlan(args: {
  zip: AdmZip;
  palworldDir: string;
  plan: PalworldPackagePlan;
}): number {
  const { zip, palworldDir, plan } = args;
  for (const file of plan.files) {
    const entry = zip.getEntry(file.entry);
    if (!entry) throw new Error(`Planned entry '${file.entry}' vanished from the package zip.`);
    const dest = safeJoin(palworldDir, file.destRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.getData());
  }
  const manifestPath = safeJoin(palworldDir, plan.manifestRel);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ files: plan.files.map((f) => f.destRel) }, null, 2)
  );
  return plan.files.length;
}

/**
 * Remove a package's installed files using its manifest, pruning directories
 * it emptied. A missing manifest (pre-manifest install) removes only the
 * overlay wrapper — the mod/pak contributions are left alone and reported
 * by the caller.
 */
export function uninstallPalworldPackage(args: {
  palworldDir: string;
  fullName: string;
}): { removedFiles: number; manifestMissing: boolean } {
  const { palworldDir, fullName } = args;
  const manifestPath = safeJoin(palworldDir, ".realmswap", `${fullName}.json`);

  // The overlay wrapper is always ours to remove (core or game-rooted
  // package contribution).
  const overlayDir = path.join(palworldDir, PALWORLD_OVERLAY_DIR, fullName);
  let removedFiles = removeTreeCounting(overlayDir);

  let manifestMissing = false;
  let destRels: string[] = [];
  try {
    destRels = JSON.parse(fs.readFileSync(manifestPath, "utf-8")).files ?? [];
  } catch {
    manifestMissing = true;
  }
  for (const rel of destRels) {
    const target = safeJoin(palworldDir, rel);
    try {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) removedFiles += removeTreeCounting(target);
      else {
        fs.unlinkSync(target);
        removedFiles++;
      }
    } catch {
      // Already gone.
    }
  }
  // Prune dirs the package emptied (mods/<Name>/, pak data dirs, ...).
  const managedRoots = [PALWORLD_MODS_DIR, PALWORLD_PAKS_DIR, PALWORLD_CFGS_DIR].map((d) =>
    path.join(palworldDir, d)
  );
  for (const rel of destRels) {
    let dir = path.dirname(safeJoin(palworldDir, rel));
    while (managedRoots.some((r) => dir.startsWith(r + path.sep))) {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        break;
      }
      if (entries.length > 0) break;
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    }
  }
  try {
    fs.unlinkSync(manifestPath);
  } catch {
    // No manifest to clean.
  }
  return { removedFiles, manifestMissing };
}

function removeTreeCounting(dir: string): number {
  let count = 0;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) count += removeTreeCounting(child);
    else {
      try {
        fs.unlinkSync(child);
        count++;
      } catch {}
    }
  }
  try {
    fs.rmdirSync(dir);
  } catch {}
  return count;
}
