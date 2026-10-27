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
import { downloadFile } from "@/lib/download";
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
  curseForgeDownloadUrl, curseForgeSha1, type CfManifest,
} from "@/lib/mods/curseforge";
import { resolveVanillaServerJar, applyVanillaServerSwap, type VanillaServerJar } from "@/lib/mods/mcServerJar";
import type { ModProgressEvent } from "@/lib/mods/progress";

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
  const zip = new AdmZip(zipBuffer);
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
  overridesCount: number;
  /** Set when the apply swapped server.jar to the pack's Minecraft release. */
  mcSwitchedTo?: string;
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
  if (plan.mcSwitch) {
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
        await installFabricServer(serverRoot, effectiveMcVersion, onLog);
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
  const installedPackageIds: string[] = [];

  if (plan.cfPlan && plan.cfManifest) {
    const modsDir = path.join(serverRoot, "mods");
    fs.mkdirSync(modsDir, { recursive: true });

    if (!plan.packLoader && plan.cfPlan.files.length > 0) {
      warnings.push("Pack pins no mod loader — its mods/ jars will not load on a vanilla server.");
    }

    const fileTotal = plan.cfPlan.files.length;
    if (fileTotal > 0) p({ stage: "mods", current: 0, total: fileTotal });

    for (const [index, cfFile] of Array.from(plan.cfPlan.files.entries())) {
      p({ stage: "mods", current: index, total: fileTotal, label: cfFile.displayName || cfFile.fileName });
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
      p({ stage: "mods", current: index + 1, total: fileTotal });
    }

    if (plan.cfPlan.skippedOptional > 0) {
      clientOnlyCount = plan.cfPlan.skippedOptional;
      warnings.push(`${plan.cfPlan.skippedOptional} optional file(s) skipped — CurseForge marks them non-required (usually client-side).`);
    }
  } else if (plan.mrpackIndex) {
    const { install, clientOnly, optional } = selectServerFiles(plan.mrpackIndex.files);
    clientOnlyCount = clientOnly.length;

    if (!plan.packLoader && install.some((f) => f.path.startsWith("mods/"))) {
      warnings.push("Pack declares no mod loader — its mods/ jars will not load on a vanilla server.");
    }

    const mrpackBytes = install.reduce((sum, f) => sum + (f.fileSize ?? 0), 0);
    if (mrpackBytes > 0) bytesTotal = (bytesTotal ?? 0) + mrpackBytes;
    if (install.length > 0) p({ stage: "mods", current: 0, total: install.length });

    for (const [index, manifestFile] of Array.from(install.entries())) {
      p({ stage: "mods", current: index, total: install.length, label: manifestFile.path });
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
        const packageId = path.basename(rel, ".jar");
        await prisma.modInstallation.upsert({
          where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId } },
          update: { version: plan.packVersion },
          create: {
            serverId, provider: "modrinth", packageId,
            version: plan.packVersion, name: packageId,
          },
        });
        installedPackageIds.push(packageId);
      }
      installedCount++;
      p({ stage: "mods", current: index + 1, total: install.length });
    }

    if (optional.length > 0) {
      warnings.push(`${optional.length} file(s) are optional on the server side — installed anyway.`);
    }
  }

  // Overrides go on last so pack-provided files win over manifest downloads.
  p({ stage: "overrides", label: "Applying pack overrides (configs, scripts)" });
  const overridesCount = extractMrpackOverrides(plan.zip, serverRoot, plan.overridesPrefixes);

  return {
    installedCount, clientOnlyCount, overridesCount,
    ...(plan.mcSwitch ? { mcSwitchedTo: plan.mcSwitch.to } : {}),
    installedPackageIds,
  };
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
    `${result.clientOnlyCount} client-only skipped, ${result.overridesCount} overrides applied.` +
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
