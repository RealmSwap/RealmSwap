import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { addArkActiveMod, arkGameUserSettingsIniPath, removeArkActiveMod } from "@/lib/mods/ark";
import {
  disableZomboidWorkshopModContent, addZomboidWorkshopModContent, zomboidServerIniPath,
} from "@/lib/mods/zomboid";
import { addTmlEnabledMods, deriveTmodNames, readTmlMarker, removeTmlEnabledMods, tmlEnabledJsonPath, tmlInstallDir, tmlWorkshopRoot } from "@/lib/mods/tml";
import { WORKSHOP_APP_IDS } from "@/lib/mods/workshop";
import { oxidePluginsDir } from "@/lib/mods/umod";
import { localServerRoot } from "@/lib/mods/uninstall";

/**
 * Per-mod enable/disable: the files (and downloaded content) stay, but the
 * mod is delisted from whatever the game loads at boot.
 *
 *  - Minecraft:       mods/<id>.jar renamed to <id>.jar.disabled
 *  - Valheim/V Rising: plugins contribution moved to BepInEx/disabled/
 *  - Rust:             Oxide/plugins/<Name>.cs moved to Oxide/plugins_disabled/
 *  - Zomboid:          Mods= entries stripped; WorkshopItems= kept so the
 *                      item stays downloaded (enable re-appends the ids)
 *  - ARK:              ActiveMods= entry removed/re-added (content stays)
 *  - Terraria/tML:     enabled.json names removed/re-added
 *  - Satisfactory:     FactoryGame/Mods/<ref> moved to Mods_disabled/
 *  - Palworld:         NOT supported — shimloader layouts span several
 *                      manager dirs, so a partial delist would lie about state
 */

export function canToggleMods(game: string): boolean {
  return game.toUpperCase() !== "PALWORLD";
}

interface ToggleInstallation {
  provider: string;
  packageId: string;
  workshopModId?: string | null;
}

/**
 * Flip one mod's disabled state on disk/ini. Returns the Workshop mod IDs to
 * persist on the row when they had to be re-derived (undefined = keep).
 */
export async function setModDisabled(args: {
  serverRoot: string;
  game: string;
  installation: ToggleInstallation;
  disabled: boolean;
}): Promise<{ workshopModId?: string }> {
  const { serverRoot, installation, disabled } = args;
  const game = args.game.toUpperCase();
  const { packageId } = installation;

  if (game === "MINECRAFT") {
    const jar = path.join(serverRoot, "mods", `${packageId}.jar`);
    const parked = `${jar}.disabled`;
    if (disabled) {
      if (!fs.existsSync(jar)) throw new Error(`'${packageId}.jar' is not in the server's mods directory.`);
      fs.renameSync(jar, parked);
    } else {
      if (!fs.existsSync(parked)) throw new Error(`'${packageId}.jar.disabled' not found — reinstall the mod.`);
      fs.renameSync(parked, jar);
    }
    return {};
  }

  if (game === "VALHEIM" || game === "VRISING") {
    const subDir = game === "VALHEIM" ? "valheim-server" : "vrising-server";
    const pluginsDir = path.join(serverRoot, subDir, "BepInEx", "plugins");
    const disabledDir = path.join(serverRoot, subDir, "BepInEx", "disabled");
    const names = [packageId, `${packageId}.dll`, `${packageId}.zip`];
    if (disabled) {
      const found = names.map((n) => path.join(pluginsDir, n)).find((p) => fs.existsSync(p));
      if (!found) throw new Error(`No plugins contribution found for '${packageId}'.`);
      fs.mkdirSync(disabledDir, { recursive: true });
      fs.renameSync(found, path.join(disabledDir, path.basename(found)));
    } else {
      const found = names.map((n) => path.join(disabledDir, n)).find((p) => fs.existsSync(p));
      if (!found) throw new Error(`No parked files for '${packageId}' under BepInEx/disabled — reinstall the mod.`);
      fs.mkdirSync(pluginsDir, { recursive: true });
      fs.renameSync(found, path.join(pluginsDir, path.basename(found)));
    }
    return {};
  }

  if (game === "RUST") {
    const plugins = oxidePluginsDir(path.join(serverRoot, "rust-server"));
    const disabledDir = path.join(path.dirname(plugins), "plugins_disabled");
    const cs = `${packageId}.cs`;
    if (disabled) {
      const src = path.join(plugins, cs);
      if (!fs.existsSync(src)) throw new Error(`Plugin '${cs}' is not in Oxide/plugins.`);
      fs.mkdirSync(disabledDir, { recursive: true });
      fs.renameSync(src, path.join(disabledDir, cs));
    } else {
      const src = path.join(disabledDir, cs);
      if (!fs.existsSync(src)) throw new Error(`Parked plugin '${cs}' not found — reinstall the plugin.`);
      fs.mkdirSync(plugins, { recursive: true });
      fs.renameSync(src, path.join(plugins, cs));
    }
    return {};
  }

  if (game === "ZOMBOID") {
    // Disable strips ONLY the Mods= entries — WorkshopItems= keeps the item
    // downloaded. Enable re-appends the ids (deriving them from the item when
    // the row lost them).
    const iniPath = zomboidServerIniPath(serverRoot);
    let content = "";
    try {
      content = fs.readFileSync(iniPath, "utf-8");
    } catch {
      throw new Error("servertest.ini not found — install the server first.");
    }
    let workshopModId = installation.workshopModId ?? null;
    if (!workshopModId || workshopModId.split(";").filter(Boolean).length === 0) {
      const contentDir = path.join(
        serverRoot, "zomboid-server", "steamapps", "workshop", "content",
        String(WORKSHOP_APP_IDS.ZOMBOID), packageId
      );
      const { deriveZomboidModIds } = await import("@/lib/mods/workshopDownload");
      workshopModId = deriveZomboidModIds(contentDir).map((m) => m.modId).join(";");
    }
    const modIds = workshopModId.split(";").filter(Boolean);
    const updated = disabled
      ? disableZomboidWorkshopModContent(content, modIds)
      : addZomboidWorkshopModContent(content, packageId, modIds);
    if (updated !== content) fs.writeFileSync(iniPath, updated);
    return { workshopModId };
  }

  if (game === "ARK") {
    const iniPath = arkGameUserSettingsIniPath(serverRoot);
    if (disabled) removeArkActiveMod(iniPath, packageId);
    else addArkActiveMod(iniPath, packageId);
    return {};
  }

  if (game === "TERRARIA") {
    const installDir = tmlInstallDir(serverRoot);
    if (!readTmlMarker(installDir)) {
      throw new Error("tModLoader is not installed on this server.");
    }
    let names = (installation.workshopModId ?? "").split(";").filter(Boolean);
    if (names.length === 0) {
      const contentDir = path.join(tmlWorkshopRoot(installDir), "content", String(WORKSHOP_APP_IDS.TERRARIA), packageId);
      names = deriveTmodNames(contentDir).map((d) => d.name);
    }
    const enabledJson = tmlEnabledJsonPath(installDir);
    if (disabled) removeTmlEnabledMods(enabledJson, names);
    else addTmlEnabledMods(enabledJson, names);
    return {};
  }

  if (game === "SATISFACTORY") {
    const modsRoot = path.join(serverRoot, "satisfactory-server", "FactoryGame", "Mods");
    const parkedRoot = path.join(serverRoot, "satisfactory-server", "FactoryGame", "Mods_disabled");
    if (disabled) {
      const src = path.join(modsRoot, packageId);
      if (!fs.existsSync(src)) throw new Error(`Mod directory '${packageId}' not found under FactoryGame/Mods.`);
      fs.mkdirSync(parkedRoot, { recursive: true });
      fs.renameSync(src, path.join(parkedRoot, packageId));
    } else {
      const src = path.join(parkedRoot, packageId);
      if (!fs.existsSync(src)) throw new Error(`Parked mod directory '${packageId}' not found — reinstall the mod.`);
      fs.mkdirSync(modsRoot, { recursive: true });
      fs.renameSync(src, path.join(modsRoot, packageId));
    }
    return {};
  }

  throw new Error(
    "Palworld packages can't be disabled without uninstalling — shimloader layouts span several manager dirs."
  );
}

/**
 * Shared body of the disable/enable routes: guards, the on-disk flip, the
 * row update and the audit log. Auth/access checks stay in the routes.
 */
export async function toggleModRow(args: {
  serverId: string;
  modId: string;
  userId: string;
  game: string;
  serverStatus: string;
  disabled: boolean;
}): Promise<{ ok: true; name: string; disabled: boolean } | { ok: false; status: number; error: string }> {
  const { serverId, modId, userId, game, serverStatus, disabled } = args;
  if (serverStatus === "RUNNING" || serverStatus === "STARTING") {
    return { ok: false, status: 400, error: "Stop the server before changing mods." };
  }
  const installation = await prisma.modInstallation.findFirst({
    where: { serverId, packageId: modId },
  });
  if (!installation) {
    return { ok: false, status: 404, error: "Mod not found in database" };
  }
  if (!canToggleMods(game)) {
    return { ok: false, status: 400, error: "Palworld packages can't be disabled without uninstalling — shimloader layouts span several manager dirs." };
  }
  if (installation.disabled === disabled) {
    return { ok: true, name: installation.name, disabled }; // already there
  }

  let workshopModId: string | null | undefined = installation.workshopModId;
  const result = await setModDisabled({
    serverRoot: localServerRoot(serverId),
    game,
    installation,
    disabled,
  });
  if (result.workshopModId !== undefined) workshopModId = result.workshopModId;

  await prisma.modInstallation.update({
    where: { id: installation.id },
    data: {
      disabled,
      ...(workshopModId !== installation.workshopModId ? { workshopModId } : {}),
    },
  });
  await prisma.activityLog.create({
    data: {
      userId,
      action: disabled ? "DISABLE_MOD" : "ENABLE_MOD",
      details: `${disabled ? "Disabled" : "Enabled"} mod '${installation.name}' on server ${serverId}.`,
    },
  }).catch(() => {});
  return { ok: true, name: installation.name, disabled };
}
