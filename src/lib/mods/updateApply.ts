import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/db";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { downloadFile } from "@/lib/download";
import { detectMinecraftVersion, readLoaderMarker } from "@/lib/mods/mcLoaders";
import {
  resolveInstallCandidate, collectRequiredDependencies, fetchVersions,
  pickCompatibleVersion, primaryFile,
} from "@/lib/mods/modrinth";
import {
  getCurseForgeModFiles, pickCompatibleCfFile, curseForgeDownloadUrl,
  collectRequiredCfMods, resolveCompatibleProjectFile, getCurseForgeMods,
} from "@/lib/mods/curseforge";
import {
  communityForGame,
  fetchCommunityIndex,
  isBepInExCore,
  newestVersion,
  extractThunderstorePackage,
  extractCorePack,
} from "@/lib/mods/thunderstore";
import { WORKSHOP_APP_IDS, getWorkshopDetails } from "@/lib/mods/workshop";
import { downloadWorkshopItem, deriveZomboidModIds } from "@/lib/mods/workshopDownload";
import {
  tmlInstallDir, tmlEnabledJsonPath, deriveTmodNames,
  removeTmlEnabledMods, addTmlEnabledMods,
} from "@/lib/mods/tml";
import { fetchUmodPluginMeta, OXIDE_CORE_MARKER, oxidePluginsDir } from "@/lib/mods/umod";
import { installPalworldThunderstore, installFicsitMod } from "@/lib/mods/installers";
import { getFicsitModByReference, getFicsitModVersion, pickFicsitServerDownload } from "@/lib/mods/ficsit";
import {
  addZomboidWorkshopMod, removeZomboidWorkshopMod, zomboidServerIniPath,
} from "@/lib/mods/zomboid";

export interface ResolvedModUpdate {
  newVersionNumber: string;
  applyUpdate: () => Promise<void>;
  /** Extra column updates the route must persist after a successful apply. */
  rowPatch?: { workshopModId?: string; dependencies?: string };
  /** Non-fatal notes (unresolvable new dependencies) the route surfaces. */
  warnings?: string[];
}

/** Resolution failed for a client-facing reason (unsupported provider/game,
 * package gone) — carries the HTTP status the route should return. */
export class UpdateResolutionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Resolve the newest available version of an installed mod and build the
 * file-swap closure that applies it. Shared by the per-mod Update route and
 * the bulk Update-all route so both always apply the identical resolution.
 * Throws Error with a user-presentable message when the provider/game
 * combination has no update path or the package is gone from the provider.
 */
export async function resolveModUpdate(
  installation: { provider: string; packageId: string; version: string; name?: string; workshopModId?: string | null },
  game: string,
  serverId: string
): Promise<ResolvedModUpdate> {
  const serverRoot = path.join(dataRoot(), "local-servers", serverId);

  if (installation.provider === "modrinth") {
    if (game !== "MINECRAFT") {
      throw new UpdateResolutionError("Modrinth mod updates are supported for Minecraft servers only.");
    }
    const marker = readLoaderMarker(serverRoot);
    const gameVersion = detectMinecraftVersion(serverRoot);
    const loader = marker?.type ?? null;
    const candidate = await resolveInstallCandidate(installation.packageId, {
      gameVersion,
      loader,
    });
    const dest = safeJoin(path.join(serverRoot, "mods"), `${installation.packageId}.jar`);

    // The new version may require dependencies the old one didn't — resolve
    // the required graph now (pre-snapshot) and install it inside the apply.
    const installedProjectIds = new Set(
      (await prisma.modInstallation.findMany({ where: { serverId }, select: { packageId: true } }))
        .map((m) => m.packageId)
    );
    const warnings: string[] = [];
    const { order: depVersions, missingProjects } = await collectRequiredDependencies(
      candidate.version,
      async (projectId) => {
        const depVersions = await fetchVersions(projectId);
        const depVersion = pickCompatibleVersion(depVersions, { gameVersion, loader });
        return depVersion && primaryFile(depVersion) ? depVersion : null;
      },
      (id) => installedProjectIds.has(id)
    );
    for (const depId of missingProjects) {
      warnings.push(
        `Dependency ${depId} has no compatible version${gameVersion ? ` for Minecraft ${gameVersion}` : ""} — the mod may not work without it.`
      );
    }
    const depFiles = depVersions.map((v) => {
      const file = primaryFile(v)!;
      return { projectId: v.project_id, versionNumber: v.version_number, url: file.url };
    });

    return {
      newVersionNumber: candidate.version.version_number,
      warnings: warnings.length ? warnings : undefined,
      rowPatch: { dependencies: JSON.stringify(depFiles.map((d) => d.projectId)) },
      applyUpdate: async () => {
        for (const dep of depFiles) {
          await downloadFile(dep.url, safeJoin(path.join(serverRoot, "mods"), `${dep.projectId}.jar`));
          await prisma.modInstallation.upsert({
            where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId: dep.projectId } },
            update: { version: dep.versionNumber },
            create: {
              serverId, provider: "modrinth", packageId: dep.projectId,
              version: dep.versionNumber, name: dep.projectId,
            },
          });
        }
        await downloadFile(candidate.file.url, dest);
      },
    };
  }

  if (installation.provider === "curseforge") {
    if (game !== "MINECRAFT") {
      throw new UpdateResolutionError("CurseForge mod updates are supported for Minecraft servers only.");
    }
    const modId = Number(installation.packageId);
    if (!Number.isInteger(modId) || modId <= 0) {
      throw new UpdateResolutionError(`'${installation.packageId}' is not a CurseForge mod id.`, 404);
    }
    const marker = readLoaderMarker(serverRoot);
    const mcVersion = detectMinecraftVersion(serverRoot);
    const loader = marker?.type ?? null;
    const files = await getCurseForgeModFiles(modId);
    const candidate = pickCompatibleCfFile(files, { mcVersion, loader });
    if (!candidate) {
      throw new UpdateResolutionError(`No compatible CurseForge file found for '${installation.name ?? installation.packageId}'.`, 404);
    }
    const dest = safeJoin(path.join(serverRoot, "mods"), `${installation.packageId}.jar`);

    // The new file may require dependencies the old one didn't — resolve the
    // required graph now (pre-snapshot) and install it inside the apply.
    const installedModIds = new Set(
      (await prisma.modInstallation.findMany({ where: { serverId }, select: { packageId: true } }))
        .map((m) => m.packageId)
    );
    const { order: depFiles, missingProjectIds } = await collectRequiredCfMods(
      candidate,
      (projectId) => resolveCompatibleProjectFile(projectId, { mcVersion, loader }),
      (projectId) => installedModIds.has(projectId.toString())
    );
    const warnings: string[] = missingProjectIds.map(
      (projectId) => `Dependency ${projectId} could not be resolved on CurseForge — the mod may not work without it.`
    );
    const depModIds = Array.from(new Set(depFiles.map((f) => f.modId)));
    const depNames = depModIds.length > 0
      ? new Map((await getCurseForgeMods(depModIds)).map((m) => [m.id, m.name]))
      : new Map<number, string>();

    return {
      newVersionNumber: candidate.displayName,
      warnings: warnings.length ? warnings : undefined,
      rowPatch: { dependencies: JSON.stringify(depFiles.map((d) => d.modId.toString())) },
      applyUpdate: async () => {
        for (const dep of depFiles) {
          await downloadFile(curseForgeDownloadUrl(dep), safeJoin(path.join(serverRoot, "mods"), `${dep.modId}.jar`));
          await prisma.modInstallation.upsert({
            where: { serverId_provider_packageId: { serverId, provider: "curseforge", packageId: dep.modId.toString() } },
            update: { version: dep.displayName },
            create: {
              serverId, provider: "curseforge", packageId: dep.modId.toString(),
              version: dep.displayName, name: depNames.get(dep.modId) || dep.fileName,
            },
          });
        }
        await downloadFile(curseForgeDownloadUrl(candidate), dest);
      },
    };
  }

  if (installation.provider === "umod") {
    // One metadata request resolves the newest release; the apply re-downloads
    // the plugin's .cs. Batch checks (updates.ts) stay unsupported — each
    // plugin costs uMod requests and the API 429s aggressively.
    const meta = await fetchUmodPluginMeta(installation.packageId);
    if (!meta?.latest_release_version) {
      throw new UpdateResolutionError(`Plugin '${installation.packageId}' has no releases on uMod.`, 404);
    }
    const rustDir = path.join(dataRoot(), "local-servers", serverId, "rust-server");
    if (!fs.existsSync(path.join(rustDir, OXIDE_CORE_MARKER))) {
      throw new UpdateResolutionError(
        "The Oxide framework is not installed on this server — reinstall the plugin instead."
      );
    }
    return {
      newVersionNumber: meta.latest_release_version,
      applyUpdate: async () => {
        const url = typeof meta.download_url === "string" && meta.download_url
          ? meta.download_url
          : `https://umod.org/plugins/${encodeURIComponent(installation.packageId)}.cs`;
        await downloadFile(url, safeJoin(oxidePluginsDir(rustDir), `${installation.packageId}.cs`));
      },
    };
  }

  if (installation.provider === "ficsit") {
    // Satisfactory: resolve by the stable reference, reinstall the newest
    // WindowsServer build (SML + deps stay provisioned by the installer).
    const byRef = await getFicsitModByReference(installation.packageId);
    if (!byRef) {
      throw new UpdateResolutionError(`Mod '${installation.packageId}' not found on ficsit.app.`, 404);
    }
    const resolved = await getFicsitModVersion({ modId: byRef.id });
    if (!resolved) {
      throw new UpdateResolutionError(`'${installation.packageId}' has no release version on ficsit.app.`, 404);
    }
    if (!pickFicsitServerDownload(resolved.version)) {
      throw new UpdateResolutionError(
        `'${installation.packageId}' has no WindowsServer build — the client-only release can't run on this server.`
      );
    }
    return {
      newVersionNumber: resolved.version.version,
      applyUpdate: async () => {
        await installFicsitMod({
          serverId, satisfactoryDir: path.join(serverRoot, "satisfactory-server"),
          modId: byRef.id, warnings: [],
        });
      },
    };
  }

  if (installation.provider === "thunderstore" && game === "PALWORLD") {
    // Palworld packages reinstall through the shimloader layout classifier —
    // the newest version's files land in mods/ paks/ cfgs/ overlay/.
    const index = await fetchCommunityIndex(communityForGame("PALWORLD")!);
    const pkg = index.find((p) => p.full_name === installation.packageId);
    if (!pkg) {
      throw new UpdateResolutionError(`Package '${installation.packageId}' not found on Thunderstore.`, 404);
    }
    const latest = newestVersion(pkg);
    if (!latest) {
      throw new UpdateResolutionError(`Package '${installation.packageId}' has no published versions.`, 404);
    }
    return {
      newVersionNumber: latest.version_number,
      applyUpdate: async () => {
        await installPalworldThunderstore({
          serverId, palworldDir: path.join(serverRoot, "palworld-server"),
          packageId: installation.packageId, name: installation.name, warnings: [],
        });
      },
    };
  }

  if (installation.provider === "thunderstore") {
    // BepInEx-family games share one installer shape; anything else has no
    // Thunderstore community and thus no update path.
    const bepinexGameDirs: Record<string, string> = { VALHEIM: "valheim-server", VRISING: "vrising-server" };
    const serverDirName = bepinexGameDirs[game];
    if (!serverDirName) {
      throw new UpdateResolutionError("Thunderstore mod updates are supported for Valheim and V Rising servers only.");
    }
    const community = communityForGame(game);
    if (!community) {
      throw new UpdateResolutionError("Mods are not supported for this game.");
    }
    const index = await fetchCommunityIndex(community);
    const pkg = index.find((p) => p.full_name === installation.packageId);
    if (!pkg) {
      throw new UpdateResolutionError(`Package '${installation.packageId}' not found on Thunderstore.`, 404);
    }
    const latest = newestVersion(pkg);
    if (!latest) {
      throw new UpdateResolutionError(`Package '${installation.packageId}' has no published versions.`, 404);
    }
    const serverDir = path.join(serverRoot, serverDirName);
    const pluginsDir = path.join(serverDir, "BepInEx", "plugins");
    const modDir = safeJoin(pluginsDir, installation.packageId);
    if (isBepInExCore(installation.packageId)) {
      // The core pack installs over the server root, not the plugins dir —
      // same as the install route's auto-provisioning. The wrapper folder is
      // stripped when the pack has one.
      const tempZip = safeJoin(serverDir, ".bepinex-core.staging.zip");
      return {
        newVersionNumber: latest.version_number,
        applyUpdate: async () => {
          await downloadFile(latest.download_url, tempZip);
          try {
            extractCorePack(new AdmZip(tempZip), serverDir);
          } finally {
            try { fs.unlinkSync(tempZip); } catch (_) {}
          }
        },
      };
    }
    const tempZip = safeJoin(pluginsDir, `.${installation.packageId}.staging.zip`);
    return {
      newVersionNumber: latest.version_number,
      applyUpdate: async () => {
        await downloadFile(latest.download_url, tempZip);
        try {
          const zip = new AdmZip(tempZip);
          fs.rmSync(modDir, { recursive: true, force: true });
          extractThunderstorePackage(zip, modDir);
        } finally {
          try { fs.unlinkSync(tempZip); } catch (_) {}
        }
      },
    };
  }

  if (installation.provider === "workshop") {
    if (game === "ARK") {
      throw new UpdateResolutionError(
        "ARK Workshop mods are downloaded and updated by the server itself on startup (-automanagemods) — restart the server to pick up updates."
      );
    }
    if (game !== "ZOMBOID" && game !== "TERRARIA") {
      throw new UpdateResolutionError("Steam Workshop mod updates are supported for Project Zomboid and Terraria servers only.");
    }
    const details = await getWorkshopDetails([installation.packageId]);
    const latest = details.get(installation.packageId)?.timeUpdated;
    if (!latest) {
      throw new UpdateResolutionError(
        `Workshop item '${installation.packageId}' is no longer available on the Steam Workshop.`,
        404
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(installation.version)) {
      throw new UpdateResolutionError(
        `${installation.name ?? "This mod"} has no recorded Workshop version — reinstall it once to enable update checks.`
      );
    }
    if (game === "TERRARIA") {
      // tML loads .tmods straight from the workshop content dir, so the
      // update is: re-download the item, swap the enabled.json names (a new
      // item version can rename its .tmods).
      const tmlDir = tmlInstallDir(serverRoot);
      const oldNames = (installation.workshopModId ?? "").split(";").filter(Boolean);
      const resolved: ResolvedModUpdate = {
        newVersionNumber: latest,
        applyUpdate: async () => {
          const contentDir = await downloadWorkshopItem({
            appId: WORKSHOP_APP_IDS.TERRARIA,
            workshopId: installation.packageId,
            installDir: tmlDir,
          });
          const derived = deriveTmodNames(contentDir);
          const enabledJson = tmlEnabledJsonPath(tmlDir);
          removeTmlEnabledMods(enabledJson, oldNames);
          addTmlEnabledMods(enabledJson, derived.map((d) => d.name));
          resolved.rowPatch = { workshopModId: derived.map((d) => d.name).join(";") };
        },
      };
      return resolved;
    }
    const pzDir = path.join(serverRoot, "zomboid-server");
    const oldModIds = (installation.workshopModId ?? "").split(";").filter(Boolean);
    const resolved: ResolvedModUpdate = {
      newVersionNumber: latest,
      applyUpdate: async () => {
        // Re-download (pre-caches the new content for the server's own
        // boot download) and re-derive: mod IDs can change between
        // item versions, so the ini's Mods= entries are swapped.
        const contentDir = await downloadWorkshopItem({
          appId: WORKSHOP_APP_IDS.ZOMBOID,
          workshopId: installation.packageId,
          installDir: pzDir,
        });
        const derived = deriveZomboidModIds(contentDir);
        const ini = zomboidServerIniPath(serverRoot);
        removeZomboidWorkshopMod(ini, installation.packageId, oldModIds);
        const modIds = derived.map((d) => d.modId);
        addZomboidWorkshopMod(ini, installation.packageId, modIds);
        resolved.rowPatch = { workshopModId: modIds.join(";") };
      },
    };
    return resolved;
  }

  throw new UpdateResolutionError(`Updates are not supported for provider '${installation.provider}'.`);
}
