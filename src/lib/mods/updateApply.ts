import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { downloadFile } from "@/lib/download";
import { detectMinecraftVersion, readLoaderMarker } from "@/lib/mods/mcLoaders";
import { resolveInstallCandidate } from "@/lib/mods/modrinth";
import {
  getCurseForgeModFiles, pickCompatibleCfFile, curseForgeDownloadUrl,
} from "@/lib/mods/curseforge";
import {
  communityForGame,
  fetchCommunityIndex,
  isBepInExCore,
  newestVersion,
  extractThunderstorePackage,
} from "@/lib/mods/thunderstore";
import { WORKSHOP_APP_IDS, getWorkshopDetails } from "@/lib/mods/workshop";
import { downloadWorkshopItem, deriveZomboidModIds } from "@/lib/mods/workshopDownload";
import {
  addZomboidWorkshopMod, removeZomboidWorkshopMod, zomboidServerIniPath,
} from "@/lib/mods/zomboid";

export interface ResolvedModUpdate {
  newVersionNumber: string;
  applyUpdate: () => Promise<void>;
  /** Extra column updates the route must persist after a successful apply. */
  rowPatch?: { workshopModId?: string };
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
  installation: { provider: string; packageId: string; version: string; name?: string },
  game: string,
  serverId: string
): Promise<ResolvedModUpdate> {
  const serverRoot = path.join(dataRoot(), "local-servers", serverId);

  if (installation.provider === "modrinth") {
    if (game !== "MINECRAFT") {
      throw new UpdateResolutionError("Modrinth mod updates are supported for Minecraft servers only.");
    }
    const marker = readLoaderMarker(serverRoot);
    const candidate = await resolveInstallCandidate(installation.packageId, {
      gameVersion: detectMinecraftVersion(serverRoot),
      loader: marker?.type ?? null,
    });
    const dest = safeJoin(path.join(serverRoot, "mods"), `${installation.packageId}.jar`);
    return {
      newVersionNumber: candidate.version.version_number,
      applyUpdate: async () => {
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
    const files = await getCurseForgeModFiles(modId);
    const candidate = pickCompatibleCfFile(files, {
      mcVersion: detectMinecraftVersion(serverRoot),
      loader: marker?.type ?? null,
    });
    if (!candidate) {
      throw new UpdateResolutionError(`No compatible CurseForge file found for '${installation.name ?? installation.packageId}'.`, 404);
    }
    const dest = safeJoin(path.join(serverRoot, "mods"), `${installation.packageId}.jar`);
    return {
      newVersionNumber: candidate.displayName,
      applyUpdate: async () => {
        await downloadFile(curseForgeDownloadUrl(candidate), dest);
      },
    };
  }

  if (installation.provider === "thunderstore") {
    if (game !== "VALHEIM") {
      throw new UpdateResolutionError("Thunderstore mod updates are supported for Valheim servers only.");
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
    const pluginsDir = path.join(serverRoot, "valheim-server", "BepInEx", "plugins");
    const modDir = safeJoin(pluginsDir, installation.packageId);
    if (isBepInExCore(installation.packageId)) {
      // The core pack installs over the server root, not the plugins dir —
      // same as the install route's auto-provisioning.
      const serverDir = path.join(serverRoot, "valheim-server");
      const tempZip = safeJoin(serverDir, ".bepinex-core.staging.zip");
      return {
        newVersionNumber: latest.version_number,
        applyUpdate: async () => {
          await downloadFile(latest.download_url, tempZip);
          try {
            const zip = new AdmZip(tempZip);
            zip.extractAllTo(serverDir, true);
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
    if (game !== "ZOMBOID") {
      throw new UpdateResolutionError("Steam Workshop mod updates are supported for Project Zomboid servers only.");
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
