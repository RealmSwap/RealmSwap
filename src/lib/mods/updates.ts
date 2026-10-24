import { detectMinecraftVersion, readLoaderMarker, type LoaderType } from "@/lib/mods/mcLoaders";
import { fetchVersions, pickCompatibleVersion } from "@/lib/mods/modrinth";
import { communityForGame, fetchCommunityIndex, newestVersion } from "@/lib/mods/thunderstore";
import { getWorkshopDetails, WorkshopDetail } from "@/lib/mods/workshop";
import { getCurseForgeModFiles, pickCompatibleCfFile } from "@/lib/mods/curseforge";

export interface InstalledModRow {
  provider: string;
  packageId: string;
  version: string;
  name: string;
}

export interface StaleMod {
  packageId: string;
  name: string;
  provider: string;
  current: string;
  latest: string;
}

export interface UnknownVersionMod {
  packageId: string;
  name: string;
  version: string;
}

export interface ModUpdatesResult {
  updates: StaleMod[];
  unknown: UnknownVersionMod[];
  errors: string[];
}

export interface CheckUpdatesDeps {
  fetchVersions?: typeof fetchVersions;
  fetchIndex?: typeof fetchCommunityIndex;
  fetchWorkshopDetails?: (ids: string[]) => Promise<Map<string, WorkshopDetail>>;
  getCfModFiles?: typeof getCurseForgeModFiles;
  mcVersion?: string | null;
  loader?: string | null;
}

/**
 * Compare installed mod rows against the newest provider versions using the
 * exact same resolution logic as the per-mod Update route, so the banner can
 * never disagree with the Update button.
 */
export async function checkModUpdates(opts: {
  game: string; // uppercase, e.g. "MINECRAFT"
  serverRoot: string;
  rows: InstalledModRow[];
  deps?: CheckUpdatesDeps;
}): Promise<ModUpdatesResult> {
  const { game, serverRoot, rows, deps = {} } = opts;
  const doFetchVersions = deps.fetchVersions ?? fetchVersions;
  const doFetchIndex = deps.fetchIndex ?? fetchCommunityIndex;

  const updates: StaleMod[] = [];
  const unknown: UnknownVersionMod[] = [];
  const errors: string[] = [];

  const modrinthRows = rows.filter((r) => r.provider === "modrinth");
  const thunderstoreRows = rows.filter((r) => r.provider === "thunderstore");
  const curseforgeRows = rows.filter((r) => r.provider === "curseforge");
  const workshopRows = rows.filter((r) => r.provider === "workshop" && game === "ZOMBOID");
  const otherRows = rows.filter(
    (r) =>
      r.provider !== "modrinth" && r.provider !== "thunderstore" && r.provider !== "curseforge" &&
      !(r.provider === "workshop" && game === "ZOMBOID") &&
      // ARK workshop mods are downloaded AND updated by the dedicated server
      // itself on every start (-automanagemods) — there is nothing for the
      // update machinery to do, so they are deliberately unreported.
      !(r.provider === "workshop" && game === "ARK") &&
      // uMod update checks would need one rate-limited uMod request per
      // plugin — deliberately unreported (reinstall to update).
      r.provider !== "umod"
  );
  for (const row of otherRows) {
    errors.push(`${row.name}: updates are not supported for provider "${row.provider}"`);
  }

  if (workshopRows.length > 0) {
    // Workshop "versions" are the item's last-updated timestamp (ISO) — the
    // API exposes no version numbers. Rows installed before this existed
    // carry "Workshop" and land in the unknown bucket until reinstalled.
    const doFetchDetails = deps.fetchWorkshopDetails ?? getWorkshopDetails;
    try {
      const details = await doFetchDetails(workshopRows.map((r) => r.packageId));
      for (const row of workshopRows) {
        const latest = details.get(row.packageId)?.timeUpdated;
        if (!latest) {
          errors.push(`${row.name}: no longer available on the Steam Workshop`);
          continue;
        }
        if (!/^\d{4}-\d{2}-\d{2}T/.test(row.version)) {
          unknown.push({ packageId: row.packageId, name: row.name, version: row.version });
          continue;
        }
        if (latest !== row.version) {
          updates.push({
            packageId: row.packageId,
            name: row.name,
            provider: "workshop",
            current: row.version,
            latest,
          });
        }
      }
    } catch (err: any) {
      for (const row of workshopRows) {
        errors.push(`${row.name}: ${err.message}`);
      }
    }
  }

  if (modrinthRows.length > 0 && game === "MINECRAFT") {
    const mcVersion = deps.mcVersion !== undefined ? deps.mcVersion : detectMinecraftVersion(serverRoot);
    const loader = deps.loader !== undefined ? deps.loader : readLoaderMarker(serverRoot)?.type ?? null;

    await Promise.all(
      modrinthRows.map(async (row) => {
        if (row.version === "unknown") {
          unknown.push({ packageId: row.packageId, name: row.name, version: row.version });
          return;
        }
        try {
          const versions = await doFetchVersions(row.packageId);
          const candidate = pickCompatibleVersion(versions, { gameVersion: mcVersion, loader });
          if (!candidate) {
            errors.push(`${row.name}: no compatible Modrinth version found for this server`);
            return;
          }
          if (candidate.version_number !== row.version) {
            updates.push({
              packageId: row.packageId,
              name: row.name,
              provider: "modrinth",
              current: row.version,
              latest: candidate.version_number,
            });
          }
        } catch (err: any) {
          errors.push(`${row.name}: ${err.message}`);
        }
      })
    );
  } else {
    for (const row of modrinthRows) {
      errors.push(`${row.name}: Modrinth updates are supported for Minecraft servers only`);
    }
  }

  if (curseforgeRows.length > 0 && game === "MINECRAFT") {
    const mcVersion = deps.mcVersion !== undefined ? deps.mcVersion : detectMinecraftVersion(serverRoot);
    const loader = deps.loader !== undefined ? deps.loader : readLoaderMarker(serverRoot)?.type ?? null;
    const doCfFiles = deps.getCfModFiles ?? getCurseForgeModFiles;

    await Promise.all(
      curseforgeRows.map(async (row) => {
        if (row.version === "unknown") {
          unknown.push({ packageId: row.packageId, name: row.name, version: row.version });
          return;
        }
        try {
          const modId = Number(row.packageId);
          if (!Number.isInteger(modId) || modId <= 0) throw new Error(`'${row.packageId}' is not a CurseForge mod id`);
          const files = await doCfFiles(modId);
          // deps.loader is publicly string-typed for the Modrinth pick, but
          // real values come from the loader marker (a LoaderType).
          const candidate = pickCompatibleCfFile(files, { mcVersion, loader: (loader ?? null) as LoaderType | null });
          if (!candidate) {
            errors.push(`${row.name}: no compatible CurseForge file found for this server`);
            return;
          }
          if (candidate.displayName !== row.version) {
            updates.push({
              packageId: row.packageId,
              name: row.name,
              provider: "curseforge",
              current: row.version,
              latest: candidate.displayName,
            });
          }
        } catch (err: any) {
          errors.push(`${row.name}: ${err.message}`);
        }
      })
    );
  } else {
    for (const row of curseforgeRows) {
      errors.push(`${row.name}: CurseForge updates are supported for Minecraft servers only`);
    }
  }

  if (thunderstoreRows.length > 0) {
    const community = communityForGame(game);
    if (!community) {
      for (const row of thunderstoreRows) {
        errors.push(`${row.name}: no Thunderstore community for ${game}`);
      }
    } else {
      try {
        // Index fetch is cached (10 min) and shared with installs/updates
        const index = await doFetchIndex(community);
        for (const row of thunderstoreRows) {
          if (row.version === "unknown") {
            unknown.push({ packageId: row.packageId, name: row.name, version: row.version });
            continue;
          }
          const pkg = index.find((p: any) => p.full_name === row.packageId);
          const latest = pkg ? newestVersion(pkg) : null;
          if (!pkg || !latest) {
            errors.push(`${row.name}: no longer available on Thunderstore`);
            continue;
          }
          if (latest.version_number !== row.version) {
            updates.push({
              packageId: row.packageId,
              name: row.name,
              provider: "thunderstore",
              current: row.version,
              latest: latest.version_number,
            });
          }
        }
      } catch (err: any) {
        for (const row of thunderstoreRows) {
          errors.push(`${row.name}: ${err.message}`);
        }
      }
    }
  }

  updates.sort((a, b) => a.name.localeCompare(b.name));
  unknown.sort((a, b) => a.name.localeCompare(b.name));
  return { updates, unknown, errors };
}
