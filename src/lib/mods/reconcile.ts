import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { dataRoot } from "@/lib/appPaths";
import { readZomboidModLists, zomboidServerIniPath } from "@/lib/mods/zomboid";
import { curatedZomboidWorkshopName } from "@/lib/mods/providers/SteamWorkshopProvider";
import { readArkActiveMods, arkGameUserSettingsIniPath } from "@/lib/mods/ark";
import { OXIDE_CORE_MARKER, OXIDE_CORE_PACKAGE_ID, oxidePluginsDir } from "@/lib/mods/umod";
import { WORKSHOP_APP_IDS, getWorkshopDetails } from "@/lib/mods/workshop";
import {
  tmlInstallDir, tmlWorkshopRoot, tmlEnabledJsonPath, readTmlMarker,
  readTmlEnabledMods, addTmlEnabledMods, removeTmlEnabledMods, deriveTmodNames,
} from "@/lib/mods/tml";
import { palworldManifestDir, SHIMLOADER_PACKAGE_ID, shimloaderMarkerPath } from "@/lib/mods/palworld";
import { VALHEIM_CORE_PACKAGE_ID, VRISING_CORE_PACKAGE_ID } from "@/lib/mods/thunderstore";

/**
 * Mod rows ↔ disk reconciliation.
 *
 * Restores (snapshot rollback, backup restore) replace server files without
 * touching ModInstallation rows, so afterwards the Installed tab can list mods
 * that are gone and miss mods that are back. `reconcileInstalledMods` rebuilds
 * the rows from what is actually on disk: rows whose files vanished are
 * deleted, disk entries without rows get minimal rows, and known-wrong fields
 * are repaired. Existing rows are otherwise preserved (versions, names and
 * Zomboid's workshop↔mod id pairing can't be recovered from disk alone).
 *
 * Only the providers a game actually uses are touched; anything reconcile
 * can't verify on disk is left alone. A missing directory means "nothing
 * installed", so its rows are lies and get removed.
 */

export interface ReconcileResult {
  removed: number;
  added: number;
  repaired: number;
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Restore real Workshop versions for rows reconcile re-creates. A restore
 * wiped the `time_updated` these rows carried, and without an ISO version
 * the update checks refuse them forever ("reinstall once to enable update
 * checks") — one best-effort batch lookup brings that coverage back.
 * Offline: rows are created versionless, same as before.
 */
async function workshopTimeUpdated(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const details = await getWorkshopDetails(ids);
    for (const [id, d] of Array.from(details)) {
      if (d.timeUpdated) out.set(id, d.timeUpdated);
    }
  } catch {
    // Steam unreachable — fall through to the versionless defaults.
  }
  return out;
}

/**
 * Bring rows in line with a set of disk ids: delete rows whose id is gone,
 * create minimal rows for disk ids that have none.
 */
async function applyRowDelta(
  serverId: string,
  provider: string,
  rows: { id: string; packageId: string }[],
  diskIds: Set<string>,
  makeRow: (packageId: string) => {
    serverId: string;
    provider: string;
    packageId: string;
    version: string;
    name: string;
  }
): Promise<ReconcileResult> {
  let removed = 0;
  for (const row of rows) {
    if (!diskIds.has(row.packageId)) {
      await prisma.modInstallation.delete({ where: { id: row.id } });
      removed++;
    }
  }

  const rowIds = new Set(rows.map((r) => r.packageId));
  let added = 0;
  for (const packageId of Array.from(diskIds)) {
    if (!rowIds.has(packageId)) {
      await prisma.modInstallation.create({ data: makeRow(packageId) });
      added++;
    }
  }

  return { removed, added, repaired: 0 };
}

/**
 * Minecraft: Modrinth rows are keyed by jar basename (`<projectId>.jar` from
 * installs, original filenames from .mrpack imports), so `mods/*.jar`
 * basenames are exactly the installed package ids.
 */
async function reconcileMinecraft(serverId: string, serverRoot: string): Promise<ReconcileResult> {
  const jarIds = new Set(
    listDir(path.join(serverRoot, "mods"))
      .filter((f) => f.endsWith(".jar") && !f.startsWith(".staging-"))
      .map((f) => path.basename(f, ".jar"))
  );
  // Both jar providers key rows by jar basename (CurseForge rows by project
  // id — packInstall names every manifest file mods/<projectId>.jar, and the
  // boot-retry row cleanup relies on the same convention). Reconciling only
  // modrinth left CurseForge rows as phantoms after a snapshot rollback: the
  // rows survived the restore and the Installed tab listed mods that had been
  // rolled away (seen live after a failed ATM10 install rolled back).
  // Removals run for both providers; adds stay in the modrinth pass because
  // an un-rowed jar can't be attributed to a provider from disk alone.
  const result: ReconcileResult = { removed: 0, added: 0, repaired: 0 };
  const modrinthRows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "modrinth" },
  });
  const modrinthDelta = await applyRowDelta(serverId, "modrinth", modrinthRows, jarIds, (packageId) => ({
    serverId,
    provider: "modrinth",
    packageId,
    version: "unknown",
    name: packageId,
  }));
  result.removed += modrinthDelta.removed;
  result.added += modrinthDelta.added;
  result.repaired += modrinthDelta.repaired;

  const curseforgeRows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "curseforge" },
  });
  for (const row of curseforgeRows) {
    if (!jarIds.has(row.packageId)) {
      await prisma.modInstallation.delete({ where: { id: row.id } });
      result.removed++;
    }
  }
  return result;
}

/**
 * BepInEx-family games (Valheim, V Rising): Thunderstore rows are keyed by
 * the extracted package folder under BepInEx/plugins; the BepInEx core row
 * is keyed by the doorstop marker file.
 */
async function reconcileBepInexGame(
  serverId: string,
  gameDir: string,
  corePackageId: string,
  coreName: string
): Promise<ReconcileResult> {
  const diskIds = new Set<string>();
  if (fs.existsSync(path.join(gameDir, "doorstop_config.ini"))) {
    diskIds.add(corePackageId);
  }
  const pluginsDir = path.join(gameDir, "BepInEx", "plugins");
  for (const entry of listDir(pluginsDir)) {
    if (!entry.startsWith(".") && isDirectory(path.join(pluginsDir, entry))) {
      diskIds.add(entry);
    }
  }

  const rows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "thunderstore" },
  });
  return applyRowDelta(serverId, "thunderstore", rows, diskIds, (packageId) =>
    packageId === corePackageId
      ? {
          serverId,
          provider: "thunderstore",
          packageId,
          version: "unknown",
          name: coreName,
        }
      : {
          serverId,
          provider: "thunderstore",
          packageId,
          version: "unknown",
          name: packageId,
        }
  );
}

async function reconcileValheim(serverId: string, valheimDir: string): Promise<ReconcileResult> {
  return reconcileBepInexGame(serverId, valheimDir, VALHEIM_CORE_PACKAGE_ID, "BepInExPack Valheim");
}

async function reconcileVRising(serverId: string, vrisingDir: string): Promise<ReconcileResult> {
  return reconcileBepInexGame(serverId, vrisingDir, VRISING_CORE_PACKAGE_ID, "BepInExPack V Rising");
}

/**
 * Rust: uMod rows are keyed by the plugin .cs file name under Oxide/plugins;
 * the Oxide framework row is keyed by its Oxide.Core.dll marker.
 */
async function reconcileRust(serverId: string, rustDir: string): Promise<ReconcileResult> {
  const diskIds = new Set<string>();
  if (fs.existsSync(path.join(rustDir, OXIDE_CORE_MARKER))) {
    diskIds.add(OXIDE_CORE_PACKAGE_ID);
  }
  for (const entry of listDir(oxidePluginsDir(rustDir))) {
    if (entry.endsWith(".cs")) {
      diskIds.add(entry.slice(0, -3));
    }
  }

  const rows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "umod" },
  });
  return applyRowDelta(serverId, "umod", rows, diskIds, (packageId) =>
    packageId === OXIDE_CORE_PACKAGE_ID
      ? {
          serverId,
          provider: "umod",
          packageId,
          version: "release",
          name: "Oxide/uMod framework",
        }
      : {
          serverId,
          provider: "umod",
          packageId,
          version: "unknown",
          name: packageId,
        }
  );
}

/**
 * ARK: workshop rows are keyed by the ActiveMods= ids in GameUserSettings.ini
 * ([ServerSettings]). Single id space — a row's packageId IS the ini entry.
 */
async function reconcileArk(serverId: string, serverRoot: string): Promise<ReconcileResult> {
  const activeMods = new Set(readArkActiveMods(arkGameUserSettingsIniPath(serverRoot)));

  const rows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "workshop" },
  });

  let removed = 0;
  let added = 0;
  const survivingIds = new Set<string>();
  for (const row of rows) {
    if (!activeMods.has(row.packageId)) {
      await prisma.modInstallation.delete({ where: { id: row.id } });
      removed++;
      continue;
    }
    survivingIds.add(row.packageId);
  }

  for (const workshopId of Array.from(activeMods)) {
    if (!survivingIds.has(workshopId)) {
      await prisma.modInstallation.create({
        data: {
          serverId,
          provider: "workshop",
          packageId: workshopId,
          version: "Workshop",
          name: `Workshop ${workshopId}`,
        },
      });
      added++;
    }
  }

  return { removed, added, repaired: 0 };
}

/**
 * Zomboid: workshop rows are keyed by the WorkshopItems= ids in
 * servertest.ini. The ini's two keys can't be re-paired from disk alone, so a
 * row's workshopModId is kept as-is while that id is still enabled on Mods=,
 * and dropped (set null) once it isn't — uninstall would otherwise strip a
 * stale id from the wrong key.
 */
async function reconcileZomboid(serverId: string, serverRoot: string): Promise<ReconcileResult> {
  const { workshopIds, modIds } = readZomboidModLists(zomboidServerIniPath(serverRoot));
  const workshopIdSet = new Set(workshopIds);
  const modIdSet = new Set(modIds);

  const rows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "workshop" },
  });

  let removed = 0;
  let repaired = 0;
  const survivingIds = new Set<string>();
  for (const row of rows) {
    if (!workshopIdSet.has(row.packageId)) {
      await prisma.modInstallation.delete({ where: { id: row.id } });
      removed++;
      continue;
    }
    survivingIds.add(row.packageId);
    // workshopModId may be ';'-joined (multi-mod items): drop stale ids,
    // nulling the field only when none survive on Mods=.
    if (row.workshopModId) {
      const ids = row.workshopModId.split(";").filter(Boolean);
      const surviving = ids.filter((id) => modIdSet.has(id));
      if (surviving.length === 0) {
        await prisma.modInstallation.update({
          where: { id: row.id },
          data: { workshopModId: null },
        });
        repaired++;
      } else if (surviving.length !== ids.length) {
        await prisma.modInstallation.update({
          where: { id: row.id },
          data: { workshopModId: surviving.join(";") },
        });
        repaired++;
      }
    }
  }

  const addedIds = Array.from(workshopIdSet).filter((id) => !survivingIds.has(id));
  const versions = await workshopTimeUpdated(addedIds);
  for (const workshopId of addedIds) {
    await prisma.modInstallation.create({
      data: {
        serverId,
        provider: "workshop",
        packageId: workshopId,
        version: versions.get(workshopId) ?? "Workshop",
        name: curatedZomboidWorkshopName(workshopId) ?? `Workshop ${workshopId}`,
      },
    });
  }

  return { removed, added: addedIds.length, repaired };
}

/**
 * Terraria/tModLoader: rows are keyed by the workshop content dirs under the
 * tML install (each dir IS one item; tML loads its .tmods from there). A
 * row's workshopModId is re-derived from the .tmods actually present, and
 * enabled.json entries for vanished mods are dropped with the row.
 */
async function reconcileTml(serverId: string, serverRoot: string): Promise<ReconcileResult> {
  const installDir = tmlInstallDir(serverRoot);
  if (!readTmlMarker(installDir)) return { removed: 0, added: 0, repaired: 0 };

  const contentRoot = path.join(tmlWorkshopRoot(installDir), "content", String(WORKSHOP_APP_IDS.TERRARIA));
  const diskIds = new Set<string>();
  if (fs.existsSync(contentRoot)) {
    for (const entry of fs.readdirSync(contentRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) diskIds.add(entry.name);
    }
  }
  const enabledJson = tmlEnabledJsonPath(installDir);

  /** Names derivable for a workshop item, or [] when it carries no .tmod. */
  const namesFor = (workshopId: string): string[] => {
    try {
      return deriveTmodNames(path.join(contentRoot, workshopId)).map((d) => d.name);
    } catch {
      return [];
    }
  };

  const rows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "workshop" },
  });

  let removed = 0;
  let repaired = 0;
  const survivingIds = new Set<string>();
  for (const row of rows) {
    if (!diskIds.has(row.packageId)) {
      await prisma.modInstallation.delete({ where: { id: row.id } });
      removed++;
      if (row.workshopModId) {
        removeTmlEnabledMods(enabledJson, row.workshopModId.split(";").filter(Boolean));
      }
      continue;
    }
    survivingIds.add(row.packageId);
    // Re-derive from disk: a new item version can rename or add .tmods.
    const names = namesFor(row.packageId);
    const joined = names.join(";");
    if (joined !== (row.workshopModId ?? "")) {
      await prisma.modInstallation.update({
        where: { id: row.id },
        data: { workshopModId: joined },
      });
      repaired++;
    }
    // The item is on disk, so its current .tmods should all be enabled.
    addTmlEnabledMods(enabledJson, names);
  }

  const addedIds = Array.from(diskIds).filter((id) => !survivingIds.has(id));
  const versions = await workshopTimeUpdated(addedIds);
  for (const workshopId of addedIds) {
    await prisma.modInstallation.create({
      data: {
        serverId,
        provider: "workshop",
        packageId: workshopId,
        version: versions.get(workshopId) ?? "unknown",
        name: `Workshop ${workshopId}`,
      },
    });
    addTmlEnabledMods(enabledJson, namesFor(workshopId));
  }
  const added = addedIds.length;

  // enabled.json is part of the disk truth too: anything listed but absent
  // from every item on disk would make tML warn at boot — trim it.
  const diskNames = new Set<string>();
  for (const id of Array.from(diskIds)) namesFor(id).forEach((n) => diskNames.add(n));
  const stale = readTmlEnabledMods(enabledJson).filter((name) => !diskNames.has(name));
  if (stale.length > 0) removeTmlEnabledMods(enabledJson, stale);

  return { removed, added, repaired };
}

/**
 * Palworld: every shimloader-package install writes an uninstall manifest at
 * .realmswap/<fullName>.json — the manifest set IS the installed-package set
 * on disk. The shimloader core (no manifest; extracted directly) is keyed by
 * its dwmapi.dll marker, like the BepInEx cores.
 */
async function reconcilePalworld(serverId: string, palworldDir: string): Promise<ReconcileResult> {
  const diskIds = new Set(
    listDir(palworldManifestDir(palworldDir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
  );
  const corePresent = fs.existsSync(shimloaderMarkerPath(palworldDir));
  if (corePresent) diskIds.add(SHIMLOADER_PACKAGE_ID);

  const rows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "thunderstore" },
  });
  return applyRowDelta(serverId, "thunderstore", rows, diskIds, (packageId) =>
    packageId === SHIMLOADER_PACKAGE_ID
      ? {
          serverId,
          provider: "thunderstore",
          packageId,
          version: "unknown",
          name: "unreal_shimloader (UE4SS)",
        }
      : {
          serverId,
          provider: "thunderstore",
          packageId,
          version: "unknown",
          name: packageId,
        }
  );
}

/**
 * Satisfactory: ficsit rows are keyed by the FactoryGame/Mods/<reference>
 * directory (SML included — it installs like any ficsit mod). A missing Mods
 * dir means nothing is installed, so all rows go.
 */
async function reconcileSatisfactory(serverId: string, satisfactoryDir: string): Promise<ReconcileResult> {
  const modsRoot = path.join(satisfactoryDir, "FactoryGame", "Mods");
  const diskIds = new Set(
    listDir(modsRoot).filter((entry) => isDirectory(path.join(modsRoot, entry)))
  );

  const rows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "ficsit" },
  });
  return applyRowDelta(serverId, "ficsit", rows, diskIds, (packageId) => ({
    serverId,
    provider: "ficsit",
    packageId,
    version: "unknown",
    name: packageId,
  }));
}

/**
 * Rebuild a server's ModInstallation rows from what is actually on disk.
 * No-op for games without disk-verifiable mod installs.
 */
export async function reconcileInstalledMods(serverId: string): Promise<ReconcileResult> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) return { removed: 0, added: 0, repaired: 0 };

  const serverRoot = path.join(dataRoot(), "local-servers", serverId);
  switch (server.game.toUpperCase()) {
    case "MINECRAFT":
      return reconcileMinecraft(serverId, serverRoot);
    case "VALHEIM":
      return reconcileValheim(serverId, path.join(serverRoot, "valheim-server"));
    case "VRISING":
      return reconcileVRising(serverId, path.join(serverRoot, "vrising-server"));
    case "RUST":
      return reconcileRust(serverId, path.join(serverRoot, "rust-server"));
    case "ZOMBOID":
      return reconcileZomboid(serverId, serverRoot);
    case "ARK":
      return reconcileArk(serverId, serverRoot);
    case "TERRARIA":
      return reconcileTml(serverId, serverRoot);
    case "PALWORLD":
      return reconcilePalworld(serverId, path.join(serverRoot, "palworld-server"));
    case "SATISFACTORY":
      return reconcileSatisfactory(serverId, path.join(serverRoot, "satisfactory-server"));
    default:
      return { removed: 0, added: 0, repaired: 0 };
  }
}
