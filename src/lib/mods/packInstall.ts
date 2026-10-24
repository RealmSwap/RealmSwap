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

  if (packMcVersion && packMcVersion !== serverMcVersion) {
    throw new PackPreflightError(
      `This pack targets Minecraft ${packMcVersion}, but the server runs ${serverMcVersion}.`
    );
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
}

/**
 * Apply a planned pack: loader install (pack-pinned), every manifest file
 * (downloaded and hash-verified), then overrides. Assumes the caller took a
 * snapshot and will boot-test + roll back.
 */
export async function applyModpackPlan(args: {
  plan: ModpackPlan;
  serverId: string;
  serverRoot: string;
  serverMcVersion: string;
  warnings: string[];
}): Promise<PackApplyResult> {
  const { plan, serverId, serverRoot, serverMcVersion, warnings } = args;

  // Packs that pin a loader: install it first, exactly like the explicit
  // "Install Loader" flow.
  if (plan.packLoader) {
    const marker = readLoaderMarker(serverRoot);
    if (!marker || marker.type !== plan.packLoader.type) {
      const onLog = (msg: string) => console.log(`[Modpack] ${msg}`);
      if (plan.packLoader.type === "fabric") {
        await installFabricServer(serverRoot, serverMcVersion, onLog);
      } else if (plan.packLoader.type === "forge") {
        await installForgeServer(serverRoot, serverMcVersion, { pinnedVersion: plan.packLoader.version, onLog });
      } else if (plan.packLoader.type === "quilt") {
        await installQuiltServer(serverRoot, serverMcVersion, { pinnedVersion: plan.packLoader.version, onLog });
      } else {
        await installNeoForgeServer(serverRoot, serverMcVersion, { pinnedVersion: plan.packLoader.version, onLog });
      }
    } else if (marker.loaderVersion !== plan.packLoader.version) {
      warnings.push(`Pack pins ${LOADER_LABELS[plan.packLoader.type]} loader ${plan.packLoader.version}; server has ${marker.loaderVersion}.`);
    }
  }

  let installedCount = 0;
  let clientOnlyCount = 0;

  if (plan.cfPlan && plan.cfManifest) {
    const modsDir = path.join(serverRoot, "mods");
    fs.mkdirSync(modsDir, { recursive: true });

    if (!plan.packLoader && plan.cfPlan.files.length > 0) {
      warnings.push("Pack pins no mod loader — its mods/ jars will not load on a vanilla server.");
    }

    for (const cfFile of plan.cfPlan.files) {
      // Jars are normalized to mods/<projectId>.jar so installs, updates,
      // uninstall and disk reconcile all share one keying convention.
      const dest = safeJoin(modsDir, `${cfFile.modId}.jar`);
      await downloadFile(curseForgeDownloadUrl(cfFile), dest);
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
      installedCount++;
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

    for (const manifestFile of install) {
      const rel = safePackPath(manifestFile.path);
      const dest = safeJoin(serverRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });

      // Try each mirror in order until one downloads AND passes the hash check.
      let downloaded = false;
      let lastError: any = null;
      for (const url of manifestFile.downloads ?? []) {
        try {
          await downloadFile(url, dest);
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
      }
      installedCount++;
    }

    if (optional.length > 0) {
      warnings.push(`${optional.length} file(s) are optional on the server side — installed anyway.`);
    }
  }

  // Overrides go on last so pack-provided files win over manifest downloads.
  const overridesCount = extractMrpackOverrides(plan.zip, serverRoot, plan.overridesPrefixes);

  return { installedCount, clientOnlyCount, overridesCount };
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
      details: `Imported ${plan.kind === "curseforge" ? "CurseForge " : ""}modpack '${plan.packName}' (${plan.packVersion}) onto server '${serverName}': ${result.installedCount} files installed, ${result.clientOnlyCount} client-only skipped, ${result.overridesCount} overrides applied.${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
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
