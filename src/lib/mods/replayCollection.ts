import fs from "fs";
import path from "path";
import {
  readLoaderMarker, detectMinecraftVersion,
  installFabricServer, installForgeServer, installNeoForgeServer, installQuiltServer,
} from "@/lib/mods/mcLoaders";
import {
  installMinecraftMod, installMinecraftCurseforge, installValheimThunderstore, installZomboidWorkshopMod,
  installVRisingThunderstore, installArkWorkshopMod, installFicsitMod, installTmlWorkshopMod, installTmlLoader,
  installPalworldThunderstore, ensureShimloaderCore,
} from "@/lib/mods/installers";
import { SHIMLOADER_PACKAGE_ID } from "@/lib/mods/palworld";
import { readTmlMarker, tmlInstallDir } from "@/lib/mods/tml";
import { installOxideCore, installRustUmodPlugin, OXIDE_CORE_PACKAGE_ID } from "@/lib/mods/umod";

export const LOADER_LABELS: Record<string, string> = {
  fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge", tmodloader: "tModLoader",
};

export interface ReplayableMod {
  provider: string;
  packageId: string;
  name?: string;
  version?: string;
  workshopModId?: string | null;
}

export interface ReplayLoaderRef {
  type: "fabric" | "quilt" | "forge" | "neoforge" | "tmodloader";
  loaderVersion: string;
  minecraftVersion?: string;
}

export interface ReplayCollectionArgs {
  game: string; // uppercase game slug
  serverId: string;
  serverRoot: string;
  loader?: ReplayLoaderRef | null;
  mods: ReplayableMod[];
  warnings: string[];
  onLog?: (msg: string) => void;
}

/**
 * Conflict pre-check for pinned loaders on an EXISTING install. Returns a
 * human error string when replaying would flip a server to a different
 * loader — callers turn that into a 400 before spending a snapshot. A null
 * means "go ahead" (no marker yet, or the same loader).
 */
export function checkLoaderConflict(
  game: string,
  serverRoot: string,
  loader: ReplayLoaderRef | null | undefined,
): string | null {
  if (game === "MINECRAFT" && loader) {
    const existing = readLoaderMarker(serverRoot);
    if (existing && existing.type !== loader.type) {
      const want = LOADER_LABELS[loader.type];
      const have = LOADER_LABELS[existing.type];
      return `This realm pins the ${want} loader, but this server runs ${have}. Restore a pre-loader snapshot first, then deploy.`;
    }
  }
  if (game === "TERRARIA" && loader?.type === "tmodloader") {
    // tModLoader installs beside the vanilla server; a marker flip is not a
    // destructive conflict the way MC loaders are, so no check here.
    return null;
  }
  return null;
}

/**
 * Install the pinned loader (MC + tModLoader) exactly like the explicit
 * "Install Loader" flow. Assumes checkLoaderConflict already passed. Shared
 * by mod-collection import and realm materialization.
 */
export async function installPinnedLoader(
  game: string,
  serverRoot: string,
  loader: ReplayLoaderRef,
  warnings: string[],
  onLog: (msg: string) => void,
): Promise<void> {
  if (game === "MINECRAFT") {
    const marker = readLoaderMarker(serverRoot);
    if (!marker || marker.type !== loader.type) {
      const mcVersion = loader.minecraftVersion ?? detectMinecraftVersion(serverRoot);
      if (!mcVersion) {
        throw new Error("Couldn't determine the Minecraft version to install the loader for.");
      }
      if (loader.type === "fabric") {
        await installFabricServer(serverRoot, mcVersion, onLog);
      } else if (loader.type === "forge") {
        await installForgeServer(serverRoot, mcVersion, { pinnedVersion: loader.loaderVersion, onLog });
      } else if (loader.type === "quilt") {
        await installQuiltServer(serverRoot, mcVersion, { pinnedVersion: loader.loaderVersion, onLog });
      } else {
        await installNeoForgeServer(serverRoot, mcVersion, { pinnedVersion: loader.loaderVersion, onLog });
      }
    } else if (marker.loaderVersion !== loader.loaderVersion) {
      warnings.push(
        `Realm pins ${LOADER_LABELS[loader.type]} loader ${loader.loaderVersion}; server has ${marker.loaderVersion}.`
      );
    }
    return;
  }
  if (game === "TERRARIA" && loader.type === "tmodloader" && !readTmlMarker(tmlInstallDir(serverRoot))) {
    await installTmlLoader({ serverRoot, onLog });
  }
}

/**
 * Replay each mod through the same install path as single installs — the
 * per-game installers, pinned to the exported/published versions. No
 * placeholder files, no "latest" guesses. Returns the number of extra
 * dependencies the installers pulled in. Throws on the first failure; the
 * caller owns rollback.
 */
export async function replayMods(args: ReplayCollectionArgs): Promise<number> {
  const { game, serverId, serverRoot, mods, warnings, onLog } = args;
  const log = args.onLog ?? ((msg: string) => console.log(`[Replay] ${msg}`));
  let dependencyCount = 0;

  for (const mod of args.mods) {
    if (game === "MINECRAFT") {
      // Exports carry both jar providers — replay each through its own
      // installer (CurseForge rows key by project id, Modrinth by project id too).
      if (mod.provider === "curseforge") {
        await installMinecraftCurseforge({
          serverId, installDir: serverRoot, modId: mod.packageId,
          version: mod.version, warnings,
        });
      } else if (mod.provider === "modrinth") {
        const result = await installMinecraftMod({
          serverId, installDir: serverRoot, projectId: mod.packageId,
          versionNumber: mod.version, warnings,
        });
        dependencyCount += result.dependencyCount;
      } else {
        throw new Error(`Realm entry '${mod.packageId}' uses provider '${mod.provider}', which Minecraft doesn't support.`);
      }
    } else if (game === "VALHEIM") {
      if (mod.provider !== "thunderstore") {
        throw new Error(`Realm entry '${mod.packageId}' uses provider '${mod.provider}', which Valheim doesn't support.`);
      }
      const valheimDir = path.join(serverRoot, "valheim-server");
      if (!fs.existsSync(valheimDir)) {
        throw new Error("Valheim server directory not found. Please start/install the server first.");
      }
      const result = await installValheimThunderstore({
        serverId, valheimDir, packageId: mod.packageId,
        name: mod.name, versionNumber: mod.version, warnings,
      });
      dependencyCount += result.dependencyCount;
    } else if (game === "VRISING") {
      if (mod.provider !== "thunderstore") {
        throw new Error(`Realm entry '${mod.packageId}' uses provider '${mod.provider}', which V Rising doesn't support.`);
      }
      const vrisingDir = path.join(serverRoot, "vrising-server");
      if (!fs.existsSync(vrisingDir)) {
        throw new Error("V Rising server directory not found. Please start/install the server first.");
      }
      const result = await installVRisingThunderstore({
        serverId, vrisingDir, packageId: mod.packageId,
        name: mod.name, versionNumber: mod.version, warnings,
      });
      dependencyCount += result.dependencyCount;
    } else if (game === "ZOMBOID") {
      if (mod.provider !== "workshop") {
        throw new Error(`Realm entry '${mod.packageId}' uses provider '${mod.provider}', which Project Zomboid doesn't support.`);
      }
      if (!mod.workshopModId) {
        throw new Error(
          `Realm entry '${mod.name || mod.packageId}' has no workshopModId — Zomboid mods need both the Workshop ID and the ini Mod ID.`
        );
      }
      await installZomboidWorkshopMod({
        serverId, serverRoot, workshopId: mod.packageId, modId: mod.workshopModId, name: mod.name,
      });
    } else if (game === "ARK") {
      if (mod.provider !== "workshop") {
        throw new Error(`Realm entry '${mod.packageId}' uses provider '${mod.provider}', which ARK doesn't support.`);
      }
      // The Workshop ID goes onto ActiveMods= — with -automanagemods the
      // engine downloads and updates the mod itself at boot, so import
      // is a pure ini replay.
      await installArkWorkshopMod({
        serverId, serverRoot, workshopId: mod.packageId, name: mod.name, version: mod.version,
      });
    } else if (game === "TERRARIA") {
      if (mod.provider !== "workshop") {
        throw new Error(`Realm entry '${mod.packageId}' uses provider '${mod.provider}', which Terraria doesn't support.`);
      }
      // Unlike Zomboid, no workshopModId needed: the installer derives
      // the .tmod names from the downloaded item itself.
      await installTmlWorkshopMod({
        serverId, serverRoot, workshopId: mod.packageId, name: mod.name, version: mod.version,
      });
    } else if (game === "RUST") {
      const rustDir = path.join(serverRoot, "rust-server");
      if (!fs.existsSync(path.join(rustDir, "RustDedicated_Data"))) {
        throw new Error("Rust server is not installed yet — install the server before importing plugins.");
      }
      if (mod.provider !== "umod") {
        throw new Error(`Realm entry '${mod.packageId}' uses provider '${mod.provider}', which Rust doesn't support.`);
      }
      if (mod.packageId === OXIDE_CORE_PACKAGE_ID) {
        // The framework row exports like any other — reinstall the core.
        await installOxideCore({ serverId, rustDir });
      } else {
        await installRustUmodPlugin({
          serverId, rustDir, packageId: mod.packageId, name: mod.name,
          exportedVersion: mod.version, warnings,
        });
      }
    } else if (game === "PALWORLD") {
      if (mod.provider !== "thunderstore") {
        throw new Error(`Realm entry '${mod.packageId}' uses provider '${mod.provider}', which Palworld doesn't support.`);
      }
      const palworldDir = path.join(serverRoot, "palworld-server");
      if (!fs.existsSync(palworldDir)) {
        throw new Error("Palworld server is not installed yet — install the server before importing mods.");
      }
      if (mod.packageId === SHIMLOADER_PACKAGE_ID) {
        // The framework row exports like any other — reinstall the core.
        await ensureShimloaderCore(serverId, palworldDir);
      } else {
        await installPalworldThunderstore({
          serverId, palworldDir, packageId: mod.packageId, name: mod.name, versionNumber: mod.version, warnings,
        });
      }
    } else if (game === "SATISFACTORY") {
      if (mod.provider !== "ficsit") {
        throw new Error(`Realm entry '${mod.packageId}' uses provider '${mod.provider}', which Satisfactory doesn't support.`);
      }
      const satisfactoryDir = path.join(serverRoot, "satisfactory-server");
      if (!fs.existsSync(path.join(satisfactoryDir, "FactoryServer.exe"))) {
        throw new Error("Satisfactory server is not installed yet — install the server before importing mods.");
      }
      // Collections ship the stable mod reference (the dir name); unlike
      // uMod, ficsit serves every published version, so pins install exactly.
      const result = await installFicsitMod({
        serverId, satisfactoryDir, modId: mod.packageId, versionNumber: mod.version, warnings,
      });
      dependencyCount += result.dependencyCount;
    } else {
      throw new Error(`Realm mod replay is not supported for game: ${game}`);
    }
    log(`Installed ${mod.name || mod.packageId}`);
  }

  return dependencyCount;
}
