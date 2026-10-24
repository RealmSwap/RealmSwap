import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { dataRoot } from "@/lib/appPaths";
import { readZomboidModLists, zomboidServerIniPath } from "@/lib/mods/zomboid";
import { curatedZomboidWorkshopName } from "@/lib/mods/providers/SteamWorkshopProvider";

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

const BEPINEX_CORE_PACKAGE_ID = "denikson-BepInExPack_Valheim";
const BEPINEX_CORE_VERSION = "5.4.2202";

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
  const rows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "modrinth" },
  });
  return applyRowDelta(serverId, "modrinth", rows, jarIds, (packageId) => ({
    serverId,
    provider: "modrinth",
    packageId,
    version: "unknown",
    name: packageId,
  }));
}

/**
 * Valheim: Thunderstore rows are keyed by the extracted package folder under
 * BepInEx/plugins; the BepInEx core row is keyed by the doorstop marker file.
 */
async function reconcileValheim(serverId: string, valheimDir: string): Promise<ReconcileResult> {
  const diskIds = new Set<string>();
  if (fs.existsSync(path.join(valheimDir, "doorstop_config.ini"))) {
    diskIds.add(BEPINEX_CORE_PACKAGE_ID);
  }
  const pluginsDir = path.join(valheimDir, "BepInEx", "plugins");
  for (const entry of listDir(pluginsDir)) {
    if (!entry.startsWith(".") && isDirectory(path.join(pluginsDir, entry))) {
      diskIds.add(entry);
    }
  }

  const rows = await prisma.modInstallation.findMany({
    where: { serverId, provider: "thunderstore" },
  });
  return applyRowDelta(serverId, "thunderstore", rows, diskIds, (packageId) =>
    packageId === BEPINEX_CORE_PACKAGE_ID
      ? {
          serverId,
          provider: "thunderstore",
          packageId,
          version: BEPINEX_CORE_VERSION,
          name: "BepInExPack Valheim",
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

  let added = 0;
  for (const workshopId of Array.from(workshopIdSet)) {
    if (!survivingIds.has(workshopId)) {
      await prisma.modInstallation.create({
        data: {
          serverId,
          provider: "workshop",
          packageId: workshopId,
          version: "Workshop",
          name: curatedZomboidWorkshopName(workshopId) ?? `Workshop ${workshopId}`,
        },
      });
      added++;
    }
  }

  return { removed, added, repaired };
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
    case "ZOMBOID":
      return reconcileZomboid(serverId, serverRoot);
    default:
      return { removed: 0, added: 0, repaired: 0 };
  }
}
