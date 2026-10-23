import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/db";
import { downloadFile } from "@/lib/download";
import { safeJoin } from "@/lib/safePath";
import {
  readLoaderMarker, detectMinecraftVersion, detectModLoader,
} from "@/lib/mods/mcLoaders";
import {
  resolveInstallCandidate, fetchVersions, pickCompatibleVersion, primaryFile,
  collectRequiredDependencies,
} from "@/lib/mods/modrinth";
import {
  communityForGame, fetchCommunityIndex, findVersionEntry, newestVersion,
  collectDependencies, extractThunderstorePackage,
} from "@/lib/mods/thunderstore";
import { addZomboidWorkshopMod, zomboidServerIniPath } from "@/lib/mods/zomboid";

/**
 * Per-game mod installation steps shared by the single-mod install route and
 * the mod-collection import: they do the file work and record ModInstallation
 * rows, but NOT the snapshot / sandbox boot / rollback / audit — callers own
 * that safety cycle (single-mod installs and batch imports wrap these
 * differently).
 */

export interface InstallStepResult {
  dependencyCount: number;
}

/**
 * Install a Modrinth jar mod (and its required dependency graph) into the
 * server's mods/ directory. Refuses client-only mods and jars whose loader
 * isn't installed; records rows with real version numbers.
 */
export async function installMinecraftMod(args: {
  serverId: string;
  installDir: string;
  projectId: string;
  /** Pinned version number (e.g. from a collection export); falls back to the newest compatible. */
  versionNumber?: string;
  warnings: string[];
}): Promise<InstallStepResult> {
  const { serverId, installDir, projectId, versionNumber, warnings } = args;

  const modsDir = path.join(installDir, "mods");
  if (!fs.existsSync(modsDir)) {
    fs.mkdirSync(modsDir, { recursive: true });
  }

  // Resolve against what this server actually runs: its Minecraft
  // version and installed loader (if any).
  const marker = readLoaderMarker(installDir);
  const gameVersion = detectMinecraftVersion(installDir);
  const loader = marker?.type ?? null;

  const candidate = await resolveInstallCandidate(projectId, { gameVersion, loader, versionNumber });

  // Client-only mods are a silent no-op on a server — refuse loudly.
  if (candidate.project.server_side === "unsupported") {
    throw new Error(
      `'${candidate.project.title}' is a client-side mod — it cannot run on a server.`
    );
  }
  if (candidate.project.server_side === "optional") {
    warnings.push(
      `'${candidate.project.title}' is primarily a client mod; the server-side part may be optional.`
    );
  }

  // Required dependencies first: BFS over the Modrinth graph, skipping
  // anything already installed. Unresolvable deps warn, not fail.
  const installedProjectIds = new Set(
    (await prisma.modInstallation.findMany({ where: { serverId }, select: { packageId: true } }))
      .map((m) => m.packageId)
  );
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
  const toInstall = depVersions.map((v) => {
    const file = primaryFile(v)!;
    return {
      projectId: v.project_id,
      title: v.project_id,
      versionNumber: v.version_number,
      url: file.url,
      filename: file.filename,
    };
  });
  for (const dep of toInstall) {
    const dest = safeJoin(modsDir, `${dep.projectId}.jar`);
    await downloadFile(dep.url, dest);
    await prisma.modInstallation.upsert({
      where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId: dep.projectId } },
      update: { version: dep.versionNumber },
      create: {
        serverId, provider: "modrinth", packageId: dep.projectId,
        version: dep.versionNumber, name: dep.title,
      },
    });
  }

  // Main mod: download to a temp location first so we can inspect the jar.
  const tempJar = safeJoin(modsDir, `.staging-${Date.now()}.jar`);
  await downloadFile(candidate.file.url, tempJar);

  const needsLoader = detectModLoader(tempJar);
  if (needsLoader) {
    // NeoForge also loads jars whose manifest is the legacy Forge
    // META-INF/mods.toml, so a neoforge server satisfies "forge" mods.
    const satisfied =
      !!marker &&
      (marker.type === needsLoader || (marker.type === "neoforge" && needsLoader === "forge"));
    if (!satisfied) {
      fs.unlinkSync(tempJar);
      const loaderName = { fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge" }[needsLoader];
      throw new Error(
        `'${candidate.project.title}' requires the ${needsLoader} loader, which isn't installed on this server. Install ${loaderName} first (Installed tab → Install Loader).`
      );
    }
  }

  const destPath = safeJoin(modsDir, `${candidate.project.id}.jar`);
  fs.renameSync(tempJar, destPath);

  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId: candidate.project.id } },
    update: {
      version: candidate.version.version_number,
      name: candidate.project.title,
      dependencies: JSON.stringify(toInstall.map((d) => d.projectId)),
    },
    create: {
      serverId, provider: "modrinth", packageId: candidate.project.id,
      version: candidate.version.version_number, name: candidate.project.title,
      dependencies: JSON.stringify(toInstall.map((d) => d.projectId)),
    },
  });

  return { dependencyCount: toInstall.length };
}

/**
 * Install a Thunderstore package (and its required dependencies, resolved
 * from the package index) into a Valheim server's BepInEx plugins dir.
 * Auto-installs the BepInEx core framework first when it's missing.
 */
export async function installValheimThunderstore(args: {
  serverId: string;
  valheimDir: string;
  packageId: string;
  name?: string;
  /** Pinned version number (e.g. from a collection export); falls back to newest. */
  versionNumber?: string;
  downloadUrl?: string;
  warnings: string[];
}): Promise<InstallStepResult> {
  const { serverId, valheimDir, packageId, name, versionNumber, downloadUrl, warnings } = args;

  // Everything — version, download URL and dependency graph — is resolved
  // from the package index so the recorded rows describe what is actually
  // on disk.
  const community = communityForGame("VALHEIM");
  if (!community) {
    throw new Error("Mods are not supported for game: Valheim");
  }
  const index = await fetchCommunityIndex(community);
  const pkg = index.find((p) => p.full_name === packageId);
  if (!pkg) {
    throw new Error(`Package '${packageId}' not found on Thunderstore.`);
  }
  if (pkg.is_deprecated) {
    warnings.push(`'${pkg.name}' is deprecated on Thunderstore — consider an alternative.`);
  }

  const requested = findVersionEntry(pkg, { versionNumber, downloadUrl });
  const versionEntry = requested ?? newestVersion(pkg);
  if (!versionEntry) {
    throw new Error(`Package '${packageId}' has no published versions.`);
  }
  if (!requested) {
    warnings.push(
      `Could not match the requested version of ${pkg.name} — installing ${versionEntry.version_number} (latest).`
    );
  }

  // BepInEx core is a hard prerequisite for any plugin.
  const bepinexCheckFile = path.join(valheimDir, "doorstop_config.ini");
  if (!fs.existsSync(bepinexCheckFile)) {
    console.log(`[Sandbox] BepInEx not found for server ${serverId}. Auto-installing core framework first...`);
    const zipPath = path.join(path.dirname(valheimDir), "bepinex.zip");
    const defaultBepInExUrl = "https://github.com/BepInEx/BepInEx/releases/download/v5.4.22/BepInEx_x64_5.4.22.0.zip";

    await downloadFile(defaultBepInExUrl, zipPath);
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(valheimDir, true);
      try { fs.unlinkSync(zipPath); } catch (_) {}
    } catch (err: any) {
      throw new Error(`Failed to extract BepInEx: ${err.message}`);
    }

    await prisma.modInstallation.upsert({
      where: {
        serverId_provider_packageId: {
          serverId,
          provider: "thunderstore",
          packageId: "denikson-BepInExPack_Valheim"
        }
      },
      update: { version: "5.4.2202" },
      create: {
        serverId,
        provider: "thunderstore",
        packageId: "denikson-BepInExPack_Valheim",
        version: "5.4.2202",
        name: "BepInExPack Valheim"
      }
    });
  }

  const pluginsDir = path.join(valheimDir, "BepInEx", "plugins");
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
  }

  // Required dependencies first, skipping anything already installed.
  // Unresolvable deps warn (the mod may misbehave) instead of failing
  // the whole install.
  const installedIds = new Set(
    (await prisma.modInstallation.findMany({ where: { serverId }, select: { packageId: true } }))
      .map((m) => m.packageId)
  );
  const { order: depOrder, missing } = collectDependencies(
    { packageId, version: versionEntry },
    (id) => index.find((p) => p.full_name === id) ?? null,
    (id) => installedIds.has(id)
  );
  for (const depString of missing) {
    warnings.push(
      `Dependency ${depString} could not be resolved — the mod may not work without it.`
    );
  }

  const installPackage = async (
    depPackageId: string,
    depName: string,
    versionNumber2: string,
    url: string,
    dependenciesJson?: string
  ) => {
    const tempZip = safeJoin(pluginsDir, `.${depPackageId}.staging.zip`);
    await downloadFile(url, tempZip);
    try {
      const zip = new AdmZip(tempZip);
      const modDestDir = safeJoin(pluginsDir, depPackageId);
      fs.rmSync(modDestDir, { recursive: true, force: true });
      extractThunderstorePackage(zip, modDestDir);
    } finally {
      try { fs.unlinkSync(tempZip); } catch (_) {}
    }
    await prisma.modInstallation.upsert({
      where: { serverId_provider_packageId: { serverId, provider: "thunderstore", packageId: depPackageId } },
      update: { version: versionNumber2, name: depName, ...(dependenciesJson ? { dependencies: dependenciesJson } : {}) },
      create: {
        serverId, provider: "thunderstore", packageId: depPackageId,
        version: versionNumber2, name: depName, ...(dependenciesJson ? { dependencies: dependenciesJson } : {}),
      },
    });
  };

  for (const dep of depOrder) {
    await installPackage(dep.packageId, dep.name, dep.version, dep.downloadUrl);
  }
  await installPackage(
    packageId,
    name || pkg.name,
    versionEntry.version_number,
    versionEntry.download_url,
    JSON.stringify(depOrder.map((d) => d.packageId))
  );

  return { dependencyCount: depOrder.length };
}

/**
 * Register a Project Zomboid workshop mod: merge it into servertest.ini's
 * WorkshopItems=/Mods= keys and record a row keyed by the Workshop ID (with
 * the ini mod ID stored alongside, so uninstall can strip both keys).
 */
export async function installZomboidWorkshopMod(args: {
  serverId: string;
  serverRoot: string;
  workshopId: string;
  modId: string;
  name?: string;
}): Promise<void> {
  const { serverId, serverRoot, workshopId, modId, name } = args;
  addZomboidWorkshopMod(zomboidServerIniPath(serverRoot), workshopId, modId);
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "workshop", packageId: workshopId } },
    update: { name: name || `Workshop ${workshopId}`, workshopModId: modId },
    create: {
      serverId, provider: "workshop", packageId: workshopId,
      version: "Workshop", name: name || `Workshop ${workshopId}`, workshopModId: modId,
    },
  });
}
