/**
 * Shared modpack pipeline for both install surfaces: the manual file upload
 * (import-modpack) and one-click installs from the CurseForge pack browser
 * (install-pack). `planModpackFromZip` parses and pre-flights a pack BEFORE
 * any snapshot is spent (invalid packs cost nothing); `applyModpackPlan`
 * performs the file work. Snapshot → apply → sandbox boot → rollback stays
 * with the routes, mirroring the installer convention in installers.ts.
 */

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/db";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { downloadFileWithRetry as downloadFile } from "@/lib/download";
import {
  readLoaderMarker, detectMinecraftVersion,
  installFabricServer, installForgeServer, installNeoForgeServer, installQuiltServer,
} from "@/lib/mods/mcLoaders";
import {
  readMrpackIndex, safePackPath, selectServerFiles, verifyFileHash,
  extractMrpackOverrides, loaderRequirement, type MrpackIndex,
} from "@/lib/mods/mrpack";
import {
  readCurseForgeManifest, cfLoaderRequirement, cfOverridesPrefix, resolveCfPackFiles,
  curseForgeDownloadUrl, curseForgeSha1, fetchLoaderBuild, type CfManifest,
} from "@/lib/mods/curseforge";
import { resolveVanillaServerJar, applyVanillaServerSwap, type VanillaServerJar } from "@/lib/mods/mcServerJar";
import { stashWorldForMcSwitch } from "@/lib/mods/worldVersion";
import type { ModProgressEvent } from "@/lib/mods/progress";
import { planClientExclusions, scanJarClientSignals, loaderAcceptsJar, type ExclusionCandidate, type JarClientSignals } from "@/lib/mods/clientModFilter";

const LOADER_LABELS: Record<string, string> = {
  fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge",
};

/** Pre-flight failure (bad pack, version mismatch, loader conflict) — no snapshot was spent. */
export class PackPreflightError extends Error {}

export interface ModpackPlan {
  kind: "curseforge" | "mrpack";
  zip: AdmZip;
  packName: string;
  packVersion: string;
  packMcVersion?: string;
  packLoader: { type: "fabric" | "quilt" | "forge" | "neoforge"; version: string } | null;
  /** Pack targets a different Minecraft release than the server runs —
   * resolved at plan time (pre-snapshot), swapped at apply time. */
  mcSwitch: { from: string; to: string; jar: VanillaServerJar } | null;
  cfManifest: CfManifest | null;
  cfPlan: Awaited<ReturnType<typeof resolveCfPackFiles>> | null;
  mrpackIndex: MrpackIndex | null;
  overridesPrefixes: string[];
}

/**
 * Parse a pack zip and resolve everything that can fail before a snapshot
 * exists: manifest validity, CurseForge file metadata (distribution + hash
 * gates), the pack's Minecraft version against the server's, and loader
 * conflicts. Throws PackPreflightError with a user-presentable message.
 */
export async function planModpackFromZip(args: {
  zipBuffer: Buffer;
  serverMcVersion: string;
  loaderType?: string | null;
}): Promise<ModpackPlan> {
  const { zipBuffer, serverMcVersion, loaderType } = args;
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
    // adm-zip parses lazily, so malformed archives (duplicated entry names,
    // rejected per GHSA-p634-w6r4-rjp2) only surface on the first entries
    // access. Force the parse here so the refusal is a preflight 400 instead
    // of a raw ADM-ZIP error after the user clicked Install.
    zip.getEntries();
  } catch (openError: any) {
    throw new PackPreflightError(
      `This pack file couldn't be opened: ${openError.message}. Try re-downloading it — the zip may be truncated or malformed.`
    );
  }
  const isCurseForgePack = !!zip.getEntry("manifest.json");

  let cfManifest: CfManifest | null = null;
  let cfPlan: ModpackPlan["cfPlan"] = null;
  let mrpackIndex: MrpackIndex | null = null;
  let packMcVersion: string | undefined;
  let packLoader: ModpackPlan["packLoader"] = null;
  let mcSwitch: ModpackPlan["mcSwitch"] = null;
  let overridesPrefixes: string[] = ["overrides/", "server-overrides/"];

  try {
    if (isCurseForgePack) {
      cfManifest = readCurseForgeManifest(zip);
      packMcVersion = cfManifest.minecraft.version;
      packLoader = cfLoaderRequirement(cfManifest);
      overridesPrefixes = [cfOverridesPrefix(cfManifest)];
      // Resolve every file's metadata (and the distribution + hash gates)
      // from the CurseForge API now — before a snapshot exists to waste.
      cfPlan = await resolveCfPackFiles(cfManifest);
    } else {
      mrpackIndex = readMrpackIndex(zip);
      packMcVersion = mrpackIndex.dependencies?.["minecraft"];
      packLoader = loaderRequirement(mrpackIndex);
    }
  } catch (parseError: any) {
    throw new PackPreflightError(parseError.message);
  }

  // A pack dictates its Minecraft version: instead of refusing, plan a swap
  // of the vanilla server.jar to the pack's release. Resolution happens here
  // (before any snapshot) so a bad version name or a dead manifest costs
  // nothing; the actual download+swap runs inside the snapshot window.
  if (packMcVersion && packMcVersion !== serverMcVersion) {
    try {
      const jar = await resolveVanillaServerJar(packMcVersion);
      mcSwitch = { from: serverMcVersion, to: packMcVersion, jar };
    } catch (error: any) {
      throw new PackPreflightError(
        `This pack targets Minecraft ${packMcVersion}, which the server doesn't run: ${error.message}`
      );
    }
  }

  if (packLoader && loaderType && loaderType !== packLoader.type) {
    const want = LOADER_LABELS[packLoader.type];
    const have = LOADER_LABELS[loaderType];
    throw new PackPreflightError(
      `This pack requires the ${want} loader, but the server already runs ${have}. Install it onto a vanilla server (or one already running ${want}).`
    );
  }

  return {
    kind: isCurseForgePack ? "curseforge" : "mrpack",
    zip,
    packName: cfManifest?.name ?? mrpackIndex?.name ?? "modpack",
    packVersion: cfManifest?.version ?? mrpackIndex?.versionId ?? "unknown",
    packMcVersion,
    packLoader,
    mcSwitch,
    cfManifest,
    cfPlan,
    mrpackIndex,
    overridesPrefixes,
  };
}

export interface PackApplyResult {
  installedCount: number;
  clientOnlyCount: number;
  /** Wrong-loader pack pins skipped outright (no loadable build exists). */
  crossLoaderCount: number;
  /** Wrong-loader pack pins self-healed to the project's server-loader build. */
  crossLoaderReplaced: number;
  overridesCount: number;
  /** Set when the apply swapped server.jar to the pack's Minecraft release. */
  mcSwitchedTo?: string;
  /** Set when an unloadable pre-existing world was moved aside for the swap. */
  worldStashedTo?: string;
  /** ModInstallation packageIds this pack owns — the retirement set for updates. */
  installedPackageIds: string[];
}

/**
 * Apply a planned pack: Minecraft version swap (when the pack targets a
 * different release), loader install (pack-pinned), every manifest file
 * (downloaded and hash-verified), then overrides. Assumes the caller took a
 * snapshot and will boot-test + roll back. `progress` receives stage and
 * byte-level events for the Mod Manager's progress panel; it must never
 * throw into the install.
 */
/**
 * Run one task per item with at most `limit` in flight. Pack installs
 * download hundreds of files whose per-file mirror latency dwarfed the
 * transfer itself — a serial loop was the bulk of a 20-30 minute import.
 * The first error stops new work; in-flight downloads drain, then the error
 * rethrows, so the caller rolls back exactly as it did for serial failures.
 */
async function mapPool<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  let firstError: unknown = null;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (firstError === null) {
      const i = next++;
      if (i >= items.length) return;
      try {
        await task(items[i], i);
      } catch (err) {
        firstError = err;
      }
    }
  });
  await Promise.all(workers);
  if (firstError !== null) throw firstError;
}

export async function applyModpackPlan(args: {
  plan: ModpackPlan;
  serverId: string;
  serverRoot: string;
  serverMcVersion: string;
  warnings: string[];
  progress?: (event: Partial<ModProgressEvent>) => void;
}): Promise<PackApplyResult> {
  const { plan, serverId, serverRoot, serverMcVersion, warnings, progress } = args;
  const p = (event: Partial<ModProgressEvent>) => {
    try {
      progress?.(event);
    } catch {
      /* progress must never break an install */
    }
  };

  // Byte totals from every size the providers reported up front; individual
  // downloads may still be length-less, so the bar can move by counts too.
  let bytesDone = 0;
  let bytesTotal: number | undefined;
  if (plan.mcSwitch?.jar.size) bytesTotal = (bytesTotal ?? 0) + plan.mcSwitch.jar.size;
  if (plan.cfPlan) {
    const cfBytes = plan.cfPlan.files.reduce((sum, f) => sum + (f.fileLength ?? 0), 0);
    if (cfBytes > 0) bytesTotal = (bytesTotal ?? 0) + cfBytes;
  }
  const trackBytes = (received: number, seen: { n: number }) => {
    if (received > seen.n) {
      bytesDone += received - seen.n;
      seen.n = received;
      p({ bytesDone, ...(bytesTotal !== undefined ? { bytesTotal } : {}) });
    }
  };

  // The Minecraft release comes first: loaders and mods are built for it.
  let worldStashedTo: string | undefined;
  if (plan.mcSwitch) {
    // A world generated by the old release is often unreadable by the pack's
    // release (a downgrade: level.dat in a newer format — "Failed to load
    // datapacks", then FML's exit-0). Stash it before the swap so the boot
    // test generates a fresh, compatible world instead of failing and rolling
    // the whole install back. Upgrades keep their world.
    const stash = stashWorldForMcSwitch({
      serverRoot,
      to: plan.mcSwitch.to,
      targetDataVersion: plan.mcSwitch.jar.dataVersion ?? null,
    });
    if (stash.movedTo) {
      worldStashedTo = stash.movedTo;
      warnings.push(
        `Moved the existing world to '${path.basename(stash.movedTo)}' — ${stash.reason}; ` +
          `Minecraft ${plan.mcSwitch.to} will generate a fresh one. Delete the stash folder when you're sure you don't need it.`
      );
      p({ stage: "mcswap", label: "Moving the old version's world aside", current: 0, total: 1 });
      p({ current: 1 });
    }
    p({ stage: "mcswap", label: `Switching server.jar to Minecraft ${plan.mcSwitch.to}`, current: 0, total: 1 });
    console.log(`[Modpack] Switching server.jar: Minecraft ${plan.mcSwitch.from} → ${plan.mcSwitch.to}`);
    const jarSeen = { n: 0 };
    await applyVanillaServerSwap({
      serverRoot,
      jar: plan.mcSwitch.jar,
      onProgress: (received) => trackBytes(received, jarSeen),
    });
    p({ current: 1 });
  }
  const effectiveMcVersion = plan.mcSwitch ? plan.mcSwitch.to : serverMcVersion;

  // Packs that pin a loader: install it, exactly like the explicit
  // "Install Loader" flow. A version swap invalidates an existing loader's
  // libraries (they target the old release), so the pinned loader is
  // reinstalled even when the type already matches.
  if (plan.packLoader) {
    const marker = readLoaderMarker(serverRoot);
    if (!marker || marker.type !== plan.packLoader.type || plan.mcSwitch) {
      p({ stage: "loader", label: `Installing the ${LOADER_LABELS[plan.packLoader.type]} loader`, current: 0, total: 1 });
      const onLog = (msg: string) => console.log(`[Modpack] ${msg}`);
      if (plan.packLoader.type === "fabric") {
        await installFabricServer(serverRoot, effectiveMcVersion, { pinnedVersion: plan.packLoader.version, onLog });
      } else if (plan.packLoader.type === "forge") {
        await installForgeServer(serverRoot, effectiveMcVersion, { pinnedVersion: plan.packLoader.version, onLog });
      } else if (plan.packLoader.type === "quilt") {
        await installQuiltServer(serverRoot, effectiveMcVersion, { pinnedVersion: plan.packLoader.version, onLog });
      } else {
        await installNeoForgeServer(serverRoot, effectiveMcVersion, { pinnedVersion: plan.packLoader.version, onLog });
      }
      p({ current: 1 });
    } else if (marker.loaderVersion !== plan.packLoader.version) {
      warnings.push(`Pack pins ${LOADER_LABELS[plan.packLoader.type]} loader ${plan.packLoader.version}; server has ${marker.loaderVersion}.`);
    }
  } else if (plan.mcSwitch) {
    const marker = readLoaderMarker(serverRoot);
    if (marker) {
      warnings.push(
        `The previously installed ${LOADER_LABELS[marker.type] ?? marker.type} loader targets Minecraft ${plan.mcSwitch.from}; ` +
        `its libraries won't run on ${plan.mcSwitch.to} — reinstall it from the Mod Manager if this pack's mods need it.`
      );
    }
  }

  let installedCount = 0;
  let clientOnlyCount = 0;
  let crossLoaderCount = 0;
  let crossLoaderReplaced = 0;
  let installedPackageIds: string[] = [];
  // Downloaded jars from this install, scanned for client-only signals.
  const jarCandidates: ExclusionCandidate[] = [];

  if (plan.cfPlan && plan.cfManifest) {
    const modsDir = path.join(serverRoot, "mods");
    fs.mkdirSync(modsDir, { recursive: true });

    if (!plan.packLoader && plan.cfPlan.files.length > 0) {
      warnings.push("Pack pins no mod loader — its mods/ jars will not load on a vanilla server.");
    }

    const fileTotal = plan.cfPlan.files.length;
    if (fileTotal > 0) p({ stage: "mods", current: 0, total: fileTotal });

    const serverMcVersion = plan.mcSwitch?.to ?? plan.packMcVersion ?? "";
    // Phase 1 — download, hash-verify, scan and cross-loader heal in a pool
    // (per-file mirror latency dwarfed the transfer; a serial loop was the
    // bulk of a 20-30 minute import). Phase 2 — DB rows and warnings stay
    // serial, in file order, so rows and messages read identically to the
    // old loop.
    interface CfDownload {
      index: number;
      cfFile: (typeof plan.cfPlan.files)[number];
      dest: string;
      signals: JarClientSignals;
      pinnedLoaders: string | null;
      healedName: string | null;
    }
    const downloads: CfDownload[] = [];
    let completed = 0;
    await mapPool(plan.cfPlan.files, 6, async (cfFile, index) => {
      // Jars are normalized to mods/<projectId>.jar so installs, updates,
      // uninstall and disk reconcile all share one keying convention.
      const dest = safeJoin(modsDir, `${cfFile.modId}.jar`);
      const seen = { n: 0 };
      await downloadFile(curseForgeDownloadUrl(cfFile), dest, {
        onProgress: (received) => trackBytes(received, seen),
      });
      const actual = fs.readFileSync(dest);
      if (!verifyFileHash(actual, { sha1: curseForgeSha1(cfFile)! })) {
        fs.unlinkSync(dest);
        throw new Error(`sha1 mismatch for '${cfFile.displayName}' — the download doesn't match what CurseForge reports.`);
      }

      // Modpack manifests bundle files for OTHER loaders (client shader
      // packs, Fabric editions of a mod, legacy-Forge builds). A jar whose
      // manifest targets a different loader than the pack's server loader is
      // boot-fatal on NeoForge/Forge ("is a Fabric mod and cannot be
      // loaded"), so: try the same project's build for the server's loader
      // first — that keeps the mod in the pack — and skip the file only
      // when the project ships nothing loadable.
      let signals = scanJarClientSignals(dest);
      let pinnedLoaders: string | null = null;
      let healedName: string | null = null;
      if (plan.packLoader && signals.loaders.size > 0 && !loaderAcceptsJar(plan.packLoader.type, signals.loaders)) {
        pinnedLoaders = Array.from(signals.loaders).join("/");
        if (serverMcVersion) {
          try {
            const build = await fetchLoaderBuild(cfFile.modId, serverMcVersion, plan.packLoader.type);
            if (build) {
              await downloadFile(curseForgeDownloadUrl(build), dest, { onProgress: () => {} });
              signals = scanJarClientSignals(dest);
              if (loaderAcceptsJar(plan.packLoader.type, signals.loaders)) healedName = build.displayName || build.fileName;
            }
          } catch {
            /* self-sourcing is best-effort — exclusion below still applies */
          }
        }
      }
      downloads.push({ index, cfFile, dest, signals, pinnedLoaders, healedName });
      completed++;
      p({ stage: "mods", current: completed, total: fileTotal, label: cfFile.displayName || cfFile.fileName });
    });

    for (const d of downloads.sort((a, b) => a.index - b.index)) {
      const { cfFile, dest } = d;
      if (d.pinnedLoaders !== null) {
        if (!d.healedName) {
          fs.rmSync(dest, { force: true });
          warnings.push(
            `Skipped '${cfFile.displayName || cfFile.fileName}' — the pack pinned a ${d.pinnedLoaders} build and the server runs ${plan.packLoader!.type}; ` +
              "the project ships no " + plan.packLoader!.type + " build for Minecraft " + (serverMcVersion || "this version") + "."
          );
          crossLoaderCount++;
          continue;
        }
        warnings.push(
          `Replaced '${cfFile.displayName || cfFile.fileName}' (${d.pinnedLoaders} build) with '${d.healedName}' — the pack pinned the wrong loader for the server.`
        );
        crossLoaderReplaced++;
      }

      await prisma.modInstallation.upsert({
        where: { serverId_provider_packageId: { serverId, provider: "curseforge", packageId: String(cfFile.modId) } },
        update: { version: cfFile.displayName, name: plan.cfPlan.modNames.get(cfFile.modId) || cfFile.fileName },
        create: {
          serverId, provider: "curseforge", packageId: String(cfFile.modId),
          version: cfFile.displayName, name: plan.cfPlan.modNames.get(cfFile.modId) || cfFile.fileName,
        },
      });
      installedPackageIds.push(String(cfFile.modId));
      installedCount++;
      jarCandidates.push({
        file: dest,
        packageId: String(cfFile.modId),
        signals: d.signals,
      });
    }

    // Optional (`required: false`) CF files were downloaded like the rest;
    // the static exclusion pass below decides by each jar's own manifest
    // which of them are truly client-only, so both-sides mods the pack
    // flagged optional (Friends For Life class) reach the server.
  } else if (plan.mrpackIndex) {
    const { install, clientOnly, optional } = selectServerFiles(plan.mrpackIndex.files);
    clientOnlyCount = clientOnly.length;

    if (!plan.packLoader && install.some((f) => f.path.startsWith("mods/"))) {
      warnings.push("Pack declares no mod loader — its mods/ jars will not load on a vanilla server.");
    }

    const mrpackBytes = install.reduce((sum, f) => sum + (f.fileSize ?? 0), 0);
    if (mrpackBytes > 0) bytesTotal = (bytesTotal ?? 0) + mrpackBytes;
    if (install.length > 0) p({ stage: "mods", current: 0, total: install.length });

    // Downloads run in a pool; DB rows land serially below in file order.
    interface MrpackDownload {
      index: number;
      rel: string;
      dest: string;
    }
    const mrDownloads: MrpackDownload[] = [];
    let mrCompleted = 0;
    await mapPool(install, 6, async (manifestFile, index) => {
      const rel = safePackPath(manifestFile.path);
      const dest = safeJoin(serverRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });

      // Try each mirror in order until one downloads AND passes the hash check.
      let downloaded = false;
      let lastError: any = null;
      for (const url of manifestFile.downloads ?? []) {
        try {
          const seen = { n: 0 };
          await downloadFile(url, dest, {
            onProgress: (received) => trackBytes(received, seen),
          });
          if (!verifyFileHash(fs.readFileSync(dest), manifestFile.hashes ?? {})) {
            throw new Error("hash mismatch after download");
          }
          downloaded = true;
          break;
        } catch (err: any) {
          lastError = err;
          try { fs.unlinkSync(dest); } catch (_) {}
        }
      }
      if (!downloaded) {
        throw new Error(
          `Could not fetch '${manifestFile.path}' from the pack's mirrors (${lastError?.message ?? "no download URLs"}).`
        );
      }

      // Jar mods get ModInstallation rows so the Installed Mods list and the
      // uninstall flow cover them; pack support files (configs, datapacks…)
      // are reverted via snapshot only.
      if (rel.startsWith(`mods${path.sep}`) && rel.endsWith(".jar")) {
        mrDownloads.push({ index, rel, dest });
      }
      installedCount++;
      mrCompleted++;
      p({ stage: "mods", current: mrCompleted, total: install.length, label: manifestFile.path });
    });

    for (const d of mrDownloads.sort((a, b) => a.index - b.index)) {
      const packageId = path.basename(d.rel, ".jar");
      await prisma.modInstallation.upsert({
        where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId } },
        update: { version: plan.packVersion },
        create: {
          serverId, provider: "modrinth", packageId,
          version: plan.packVersion, name: packageId,
        },
      });
      installedPackageIds.push(packageId);
      jarCandidates.push({ file: d.dest, packageId, signals: scanJarClientSignals(d.dest) });
    }

    if (optional.length > 0) {
      warnings.push(`${optional.length} file(s) are optional on the server side — installed anyway.`);
    }
  }

  // Client-mod exclusion BEFORE the boot test: early-window service jars
  // (Sodium-class) crash dedicated servers pre-launch with an unhelpful
  // ClassNotFoundError; drop them + their required dependents up front. The
  // same pass sweeps cross-loader and manifest-less jars the download loop
  // couldn't fix (e.g. deps of an excluded jar, or a no-loader plan).
  const { excluded, reasons } = planClientExclusions(jarCandidates, undefined, {
    targetLoader: plan.packLoader?.type ?? null,
  });
  for (const c of excluded) {
    try { fs.rmSync(c.file, { force: true }); } catch {}
    if (c.packageId) {
      await prisma.modInstallation.deleteMany({
        where: { serverId, packageId: c.packageId },
      });
      installedPackageIds = installedPackageIds.filter((id) => id !== c.packageId);
    }
    warnings.push(
      `Excluded '${path.basename(c.file)}' — ${reasons.get(c.file) ?? "client-only mod"}; it would crash the dedicated server.`
    );
    clientOnlyCount++;
    installedCount--;
  }

  // Overrides go on last so pack-provided files win over manifest downloads.
  p({ stage: "overrides", label: "Applying pack overrides (configs, scripts)" });
  const overridesCount = extractMrpackOverrides(plan.zip, serverRoot, plan.overridesPrefixes);

  return {
    installedCount, clientOnlyCount, crossLoaderCount, crossLoaderReplaced, overridesCount,
    ...(plan.mcSwitch ? { mcSwitchedTo: plan.mcSwitch.to } : {}),
    ...(worldStashedTo ? { worldStashedTo } : {}),
    installedPackageIds,
  };
}

/**
 * Retire mods the server's PREVIOUS pack install owned that this plan no
 * longer includes. An install that replaces the pack (one-click reinstall,
 * manual import over an existing pack) otherwise leaves the old version's
 * jars in mods/ — zombie jars that crash the boot test and every later
 * Start. Scoped to the packageIds recorded on the old InstalledModpack row,
 * so mods the user installed individually are never touched. update-pack
 * carries its own copy of this logic inline (its old row is already loaded).
 * Runs inside the snapshot window: a rollback brings removed jars back, and
 * the retirement lands before the boot test verifies the new pack.
 */
export async function retireReplacedPackMods(args: {
  serverId: string;
  serverRoot: string;
  plan: ModpackPlan;
  result: PackApplyResult;
  warnings: string[];
}): Promise<number> {
  const { serverId, serverRoot, plan, result, warnings } = args;
  const previous = await prisma.installedModpack.findUnique({ where: { serverId } });
  if (!previous?.packageIds) return 0;
  const oldIds: string[] = (() => {
    try {
      const parsed = JSON.parse(previous.packageIds);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  })();

  const newIds = new Set(result.installedPackageIds);
  let retired = 0;
  for (const packageId of oldIds) {
    if (newIds.has(packageId)) continue;
    const jarPath = safeJoin(path.join(serverRoot, "mods"), `${packageId}.jar`);
    try {
      fs.rmSync(jarPath, { force: true });
    } catch {}
    // No provider filter: the jar is gone, so every row claiming that id must
    // go — replacing a CurseForge pack with an .mrpack import (or vice versa)
    // would otherwise retire the file but leave the other provider's row as a
    // phantom until the next reconcile.
    await prisma.modInstallation.deleteMany({ where: { serverId, packageId } });
    retired++;
  }
  if (retired > 0) {
    warnings.push(
      `${retired} mod(s) from the previous pack install are not in this pack version and were removed.`
    );
  }
  return retired;
}

/** Shared response copy for both pack routes. */
export function packResultMessage(args: {
  plan: ModpackPlan;
  result: PackApplyResult;
  warnings: string[];
}): string {
  const { plan, result, warnings } = args;
  return (
    `Imported '${plan.packName}' (${plan.packVersion}): ${result.installedCount} files installed, ` +
    `${result.clientOnlyCount} client-only skipped, ` +
    (result.crossLoaderReplaced ? `${result.crossLoaderReplaced} wrong-loader builds replaced with the server's loader, ` : "") +
    (result.crossLoaderCount ? `${result.crossLoaderCount} other-loader files skipped, ` : "") +
    `${result.overridesCount} overrides applied.` +
    (result.mcSwitchedTo ? ` Server switched to Minecraft ${result.mcSwitchedTo}.` : "") +
    (warnings.length ? ` Warnings: ${warnings.join(" ")}` : "")
  );
}

/** Shared audit row for both pack routes. */
export async function auditPackInstall(args: {
  userId: string;
  serverName: string;
  plan: ModpackPlan;
  result: PackApplyResult;
  warnings: string[];
}): Promise<void> {
  const { userId, serverName, plan, result, warnings } = args;
  await prisma.activityLog.create({
    data: {
      userId,
      action: "INSTALL_MODPACK",
      details: `Imported ${plan.kind === "curseforge" ? "CurseForge " : ""}modpack '${plan.packName}' (${plan.packVersion}) onto server '${serverName}': ${result.installedCount} files installed, ${result.clientOnlyCount} client-only skipped, ${result.overridesCount} overrides applied.${result.mcSwitchedTo ? ` Server switched to Minecraft ${result.mcSwitchedTo}.` : ""}${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
    },
  });
}

/**
 * Detect the server's Minecraft version for a pack install, with the shared
 * honest error when there is no server.jar yet. Shared by both pack routes.
 */
export function detectPackServerMcVersion(serverId: string): string {
  const serverRoot = path.join(dataRoot(), "local-servers", serverId);
  const mcVersion = detectMinecraftVersion(serverRoot);
  if (!mcVersion) {
    throw new PackPreflightError(
      "No server.jar found — install the Minecraft server before installing a modpack."
    );
  }
  return mcVersion;
}

/**
 * Record (or replace) the server's installed-pack identity. One pack per
 * server: a new install supersedes the previous row. packageIds is the
 * retirement set the update flow may drop when a newer manifest leaves mods
 * behind.
 */
export async function recordInstalledModpack(args: {
  serverId: string;
  plan: ModpackPlan;
  result: PackApplyResult;
  projectId?: string | null;
  fileId?: number | null;
  fileName?: string | null;
}): Promise<void> {
  const { serverId, plan, result, projectId, fileId, fileName } = args;
  const data = {
    kind: plan.kind,
    projectId: projectId ?? null,
    fileId: fileId ?? null,
    fileName: fileName ?? null,
    packName: plan.packName,
    version: plan.packVersion,
    mcVersion: plan.packMcVersion ?? null,
    loaderType: plan.packLoader?.type ?? null,
    loaderVersion: plan.packLoader?.version ?? null,
    packageIds: JSON.stringify(result.installedPackageIds),
  };
  await prisma.installedModpack.upsert({
    where: { serverId },
    update: data,
    create: { serverId, ...data },
  });
}

/**
 * The packageIds the server's CURRENT pack install owns. Per-mod update
 * flows must leave these alone — pack mods are a version-locked set, and
 * bumping one to provider-latest breaks the pins the rest of the pack was
 * resolved against (live: kubejs 2101.7.2-build.374 → .377 shattered
 * kubejstweaks' mixins). Packs move as a unit via update-pack.
 */
export async function packOwnedPackageIds(serverId: string): Promise<Set<string>> {
  const row = await prisma.installedModpack.findUnique({ where: { serverId } });
  if (!row?.packageIds) return new Set();
  try {
    const ids = JSON.parse(row.packageIds);
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}
