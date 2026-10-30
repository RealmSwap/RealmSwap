import fs from "fs";
import path from "path";
import { dataRoot } from "@/lib/appPaths";
import { removeZomboidWorkshopMod, zomboidServerIniPath } from "@/lib/mods/zomboid";
import { removeArkActiveMod, arkGameUserSettingsIniPath } from "@/lib/mods/ark";
import { uninstallPalworldPackage } from "@/lib/mods/palworld";
import { removeFicsitMod } from "@/lib/mods/installers";
import { removeRustUmodPlugin } from "@/lib/mods/umod";
import { removeTmlWorkshopMod } from "@/lib/mods/tml";
import { deriveZomboidModIds } from "@/lib/mods/workshopDownload";
import { WORKSHOP_APP_IDS } from "@/lib/mods/workshop";

/** The mod rows the file-level removals understand. */
export interface RemovableInstallation {
  provider: string;
  packageId: string;
  workshopModId?: string | null;
}

/**
 * Physical per-game mod removal, shared by the DELETE route and the boot
 * healer's quarantine step. Rows are the caller's business — this only
 * touches disk (and the ini/JSON lists that name the mod).
 */
export function removeModFiles(args: {
  game: string;
  /** The server's root under local-servers/. */
  serverRoot: string;
  installation: RemovableInstallation;
}): void {
  const { serverRoot, installation } = args;
  const game = args.game.toUpperCase();
  const { packageId } = installation;

  if (game === "VALHEIM" || game === "VRISING") {
    // Same layout for both: per-package folders (or loose dlls) under
    // BepInEx/plugins — or their disabled-mode parking spot.
    const subDir = game === "VALHEIM" ? "valheim-server" : "vrising-server";
    for (const folder of ["plugins", "disabled"]) {
      const base = path.join(serverRoot, subDir, "BepInEx", folder);
      for (const loose of [`${packageId}.dll`, `${packageId}.zip`]) {
        const p = path.join(base, loose);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      const modDir = path.join(base, packageId);
      if (fs.existsSync(modDir) && fs.statSync(modDir).isDirectory()) {
        fs.rmSync(modDir, { recursive: true, force: true });
      }
    }
  } else if (game === "RUST") {
    removeRustUmodPlugin(path.join(serverRoot, "rust-server"), packageId);
    // A disabled plugin is parked outside Oxide/plugins — remove it too.
    const parked = path.join(serverRoot, "rust-server", "Oxide", "plugins_disabled", `${packageId}.cs`);
    if (fs.existsSync(parked)) fs.unlinkSync(parked);
  } else if (game === "MINECRAFT") {
    for (const jarName of [`${packageId}.jar`, `${packageId}.jar.disabled`]) {
      const jarPath = path.join(serverRoot, "mods", jarName);
      if (fs.existsSync(jarPath)) {
        fs.unlinkSync(jarPath);
      }
    }
  } else if (game === "ZOMBOID") {
    // packageId is the Workshop ID (WorkshopItems=); the ini mod IDs for
    // Mods= are stored ';'-joined on the row (one item can ship several
    // mod folders) — the two id spaces are unrelated.
    const contentDir = path.join(
      serverRoot, "zomboid-server", "steamapps", "workshop", "content",
      String(WORKSHOP_APP_IDS.ZOMBOID), packageId
    );
    let modIds: string[] | null =
      installation.workshopModId ? installation.workshopModId.split(";").filter(Boolean) : null;
    if (!modIds || modIds.length === 0) {
      // Reconcile-nulled or pre-derivation rows lost the Mod IDs — re-derive
      // them from the downloaded item, or Mods= keeps a dangling entry that
      // logs "mod not found" at every boot.
      try {
        modIds = deriveZomboidModIds(contentDir).map((m) => m.modId);
      } catch {
        modIds = null; // content gone too — nothing more to derive from
      }
    }
    removeZomboidWorkshopMod(zomboidServerIniPath(serverRoot), packageId, modIds);
    // The SteamCMD pre-cache is useless without the ini entry (tML's delete
    // already removes its content dir) — don't leak it on disk.
    fs.rmSync(contentDir, { recursive: true, force: true });
  } else if (game === "ARK") {
    removeArkActiveMod(arkGameUserSettingsIniPath(serverRoot), packageId);
    // -automanagemods leaves the engine-downloaded workshop content in
    // ShooterGame/Content/Mods/<id> — multi-GB once delisted from
    // ActiveMods, so remove it with the row.
    fs.rmSync(
      path.join(serverRoot, "ark-server", "ShooterGame", "Content", "Mods", packageId),
      { recursive: true, force: true }
    );
  } else if (game === "TERRARIA") {
    // Drops the item's names from enabled.json and deletes its downloaded
    // workshop content dir (the .tmod lives inside it — tML loads straight
    // from there, there is no copy in Mods/).
    removeTmlWorkshopMod(
      serverRoot,
      packageId,
      installation.workshopModId ? installation.workshopModId.split(";").filter(Boolean) : []
    );
  } else if (game === "SATISFACTORY") {
    removeFicsitMod(path.join(serverRoot, "satisfactory-server"), packageId);
    // A disabled mod is parked next to Mods/ — remove it too.
    fs.rmSync(
      path.join(serverRoot, "satisfactory-server", "FactoryGame", "Mods_disabled", packageId),
      { recursive: true, force: true }
    );
  } else if (game === "PALWORLD") {
    // Shimloader layout: per-package uninstall manifest lists the exact
    // installed paths (mods/, paks/, cfgs/, overlay/ contributions).
    uninstallPalworldPackage({
      palworldDir: path.join(serverRoot, "palworld-server"),
      fullName: packageId,
    });
  }
}

/** Absolute server root for a local server id (shared by mod flows). */
export function localServerRoot(serverId: string): string {
  return path.join(dataRoot(), "local-servers", serverId);
}
