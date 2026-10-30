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
  resolveCfInstall, collectRequiredCfMods, resolveCompatibleProjectFile, curseForgeDownloadUrl, getCurseForgeMods,
} from "@/lib/mods/curseforge";
import {
  communityForGame, fetchCommunityIndex, findVersionEntry, newestVersion,
  collectDependencies, extractThunderstorePackage, extractCorePack,
  isBepInExCoreInstall, uniqueStagingZip, VALHEIM_CORE_PACKAGE_ID, VRISING_CORE_PACKAGE_ID,
} from "@/lib/mods/thunderstore";
// Re-exported for callers that key rows off the V Rising core pack id.
export { VRISING_CORE_PACKAGE_ID } from "@/lib/mods/thunderstore";
import { addZomboidWorkshopMod, zomboidServerIniPath } from "@/lib/mods/zomboid";
import { addArkActiveMod, arkGameUserSettingsIniPath } from "@/lib/mods/ark";
import {
  SHIMLOADER_PACKAGE_ID, PALWORLD_OVERLAY_DIR, shimloaderMarkerPath,
  planPalworldPackage, applyPalworldPlan,
} from "@/lib/mods/palworld";
import {
  getFicsitModVersion, getFicsitModByReference, pickFicsitServerDownload,
  FICSIT_SML_REFERENCE, FICSIT_SMM_MARKER, type FicsitMod,
} from "@/lib/mods/ficsit";
import { WORKSHOP_APP_IDS } from "@/lib/mods/workshop";
import { downloadWorkshopItem, deriveZomboidModIds, installSteamApp } from "@/lib/mods/workshopDownload";
import {
  tmlInstallDir, tmlEnabledJsonPath, readTmlMarker, writeTmlMarker,
  addTmlEnabledMods, deriveTmodNames, isClientOnlyWorkshopItem,
} from "@/lib/mods/tml";

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
 * Install a CurseForge jar mod (and its required dependency graph) into the
 * server's mods/ directory, mirroring the Modrinth flow. Unlike Modrinth,
 * CurseForge exposes no client/server metadata — a client-only mod is caught
 * by the sandbox boot test, which rolls the install back automatically.
 */
export async function installMinecraftCurseforge(args: {
  serverId: string;
  installDir: string;
  modId: string;
  /** displayName/fileName pin from a search card; falls back to the newest compatible file. */
  version?: string;
  warnings: string[];
}): Promise<InstallStepResult> {
  const { serverId, installDir, modId, version, warnings } = args;

  const modsDir = path.join(installDir, "mods");
  if (!fs.existsSync(modsDir)) {
    fs.mkdirSync(modsDir, { recursive: true });
  }

  const marker = readLoaderMarker(installDir);
  const gameVersion = detectMinecraftVersion(installDir);
  const loader = marker?.type ?? null;

  const candidate = await resolveCfInstall(modId, { mcVersion: gameVersion, loader, displayName: version });

  // Required dependencies first: BFS over CurseForge's PROJECT graph (the
  // API's dependency edges carry modIds), skipping anything already
  // installed. Unresolvable deps warn, not fail.
  const installedModIds = new Set(
    (await prisma.modInstallation.findMany({ where: { serverId }, select: { packageId: true } }))
      .map((m) => m.packageId)
  );
  const { order: depFiles, missingProjectIds } = await collectRequiredCfMods(
    candidate.file,
    (projectId) => resolveCompatibleProjectFile(projectId, { mcVersion: gameVersion, loader }),
    (projectId) => installedModIds.has(projectId.toString())
  );
  for (const projectId of missingProjectIds) {
    warnings.push(`Dependency ${projectId} could not be resolved on CurseForge — the mod may not work without it.`);
  }
  const depModIds = Array.from(new Set(depFiles.map((f) => f.modId)));
  const depNames = depModIds.length > 0 ? new Map((await getCurseForgeMods(depModIds)).map((m) => [m.id, m.name])) : new Map<number, string>();
  for (const dep of depFiles) {
    const dest = safeJoin(modsDir, `${dep.modId}.jar`);
    await downloadFile(curseForgeDownloadUrl(dep), dest);
    await prisma.modInstallation.upsert({
      where: { serverId_provider_packageId: { serverId, provider: "curseforge", packageId: dep.modId.toString() } },
      update: { version: dep.displayName },
      create: {
        serverId, provider: "curseforge", packageId: dep.modId.toString(),
        version: dep.displayName, name: depNames.get(dep.modId) || dep.fileName,
      },
    });
  }

  // Main mod: download to a temp location first so we can inspect the jar.
  const tempJar = safeJoin(modsDir, `.staging-${Date.now()}.jar`);
  await downloadFile(curseForgeDownloadUrl(candidate.file), tempJar);

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
        `'${candidate.mod.name}' requires the ${needsLoader} loader, which isn't installed on this server. Install ${loaderName} first (Installed tab → Install Loader).`
      );
    }
  }

  const destPath = safeJoin(modsDir, `${candidate.mod.id}.jar`);
  fs.renameSync(tempJar, destPath);

  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "curseforge", packageId: candidate.mod.id.toString() } },
    update: {
      version: candidate.file.displayName,
      name: candidate.mod.name,
      dependencies: JSON.stringify(depFiles.map((d) => d.modId.toString())),
    },
    create: {
      serverId, provider: "curseforge", packageId: candidate.mod.id.toString(),
      version: candidate.file.displayName, name: candidate.mod.name,
      dependencies: JSON.stringify(depFiles.map((d) => d.modId.toString())),
    },
  });

  return { dependencyCount: depFiles.length };
}

/**
 * Shared Thunderstore installer for the BepInEx-family games (Valheim, V
 * Rising): resolve the package, its version and dependency graph from the
 * community index, provision the game's BepInEx core when it is missing,
 * extract every content package into its own plugins/<packageId>/ folder and
 * record rows with real versions. A core pack requested directly is
 * extracted over the server root (its wrapper folder stripped) instead of
 * the plugins dir.
 */
async function installBepInExThunderstore(args: {
  serverId: string;
  serverDir: string;
  community: string;
  ensureCore: () => Promise<void>;
  packageId: string;
  name?: string;
  /** Pinned version number (e.g. from a collection export); falls back to newest. */
  versionNumber?: string;
  downloadUrl?: string;
  warnings: string[];
}): Promise<InstallStepResult> {
  const { serverId, serverDir, community, ensureCore, packageId, name, versionNumber, downloadUrl, warnings } = args;

  // Everything — version, download URL and dependency graph — is resolved
  // from the package index so the recorded rows describe what is actually
  // on disk.
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

  if (isBepInExCoreInstall(packageId)) {
    // Framework, not content: the plugins-dir layout would leave BepInEx
    // unusable, so the pack goes over the server root with its wrapper
    // folder stripped (BepInEx/, doorstop_config.ini, winhttp.dll, ...).
    const tempZip = uniqueStagingZip(serverDir, "bepinex-core");
    await downloadFile(versionEntry.download_url, tempZip);
    try {
      extractCorePack(new AdmZip(tempZip), serverDir);
    } catch (err: any) {
      throw new Error(`Failed to extract ${pkg.name}: ${err.message}`);
    } finally {
      try { fs.unlinkSync(tempZip); } catch (_) {}
    }
    await prisma.modInstallation.upsert({
      where: { serverId_provider_packageId: { serverId, provider: "thunderstore", packageId } },
      update: { version: versionEntry.version_number, name: name || pkg.name },
      create: {
        serverId, provider: "thunderstore", packageId,
        version: versionEntry.version_number, name: name || pkg.name,
      },
    });
    return { dependencyCount: 0 };
  }

  // BepInEx core is a hard prerequisite for any plugin.
  if (!fs.existsSync(path.join(serverDir, "doorstop_config.ini"))) {
    console.log(`[Sandbox] BepInEx not found for server ${serverId}. Auto-installing core framework first...`);
    await ensureCore();
  }

  const pluginsDir = path.join(serverDir, "BepInEx", "plugins");
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
    const tempZip = uniqueStagingZip(pluginsDir, depPackageId);
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
  const { serverId, valheimDir } = args;
  return installBepInExThunderstore({
    serverId,
    serverDir: valheimDir,
    community: communityForGame("VALHEIM")!,
    ensureCore: async () => {
      // The community core pack (BepInEx 5.4.22 + Valheim fixes), provisioned
      // from the same index updates resolve against — the row's id AND version
      // then describe exactly what is on disk, so the staleness banner tells
      // the truth. (The official BepInEx zip used to be installed but recorded
      // as a guessed denikson version.)
      const index = await fetchCommunityIndex(communityForGame("VALHEIM")!);
      const corePkg = index.find((p) => p.full_name === VALHEIM_CORE_PACKAGE_ID);
      const coreVersion = corePkg ? newestVersion(corePkg) : null;
      if (!corePkg || !coreVersion) {
        throw new Error("BepInExPack_Valheim is no longer available on Thunderstore — it is required for Valheim plugins.");
      }

      const tempZip = uniqueStagingZip(valheimDir, "bepinex-core");
      await downloadFile(coreVersion.download_url, tempZip);
      try {
        // The pack wraps everything in BepInExPack_Valheim/ — stripped so
        // doorstop_config.ini and BepInEx/ land at the server root.
        extractCorePack(new AdmZip(tempZip), valheimDir);
      } catch (err: any) {
        throw new Error(`Failed to extract BepInExPack_Valheim: ${err.message}`);
      } finally {
        try { fs.unlinkSync(tempZip); } catch (_) {}
      }

      await prisma.modInstallation.upsert({
        where: {
          serverId_provider_packageId: {
            serverId,
            provider: "thunderstore",
            packageId: VALHEIM_CORE_PACKAGE_ID
          }
        },
        update: { version: coreVersion.version_number },
        create: {
          serverId,
          provider: "thunderstore",
          packageId: VALHEIM_CORE_PACKAGE_ID,
          version: coreVersion.version_number,
          name: "BepInExPack Valheim"
        }
      });
    },
    packageId: args.packageId,
    name: args.name,
    versionNumber: args.versionNumber,
    downloadUrl: args.downloadUrl,
    warnings: args.warnings,
  });
}

/** The V Rising community's BepInEx core pack (BepInEx 6 for IL2CPP — the
 * official Mono BepInEx 5 zip Valheim uses would never load here). Defined
 * in thunderstore.ts next to isBepInExCoreInstall so the ids can't drift. */

async function ensureVRisingCore(serverId: string, vrisingDir: string, force: boolean): Promise<void> {
  if (!force && fs.existsSync(path.join(vrisingDir, "doorstop_config.ini"))) return;

  const index = await fetchCommunityIndex(communityForGame("VRISING")!);
  const corePkg = index.find((p) => p.full_name === VRISING_CORE_PACKAGE_ID);
  const versionEntry = corePkg ? newestVersion(corePkg) : null;
  if (!corePkg || !versionEntry) {
    throw new Error("BepInExPack_V_Rising is no longer available on Thunderstore — it is required for V Rising plugins.");
  }

  const tempZip = uniqueStagingZip(vrisingDir, "bepinex-core");
  await downloadFile(versionEntry.download_url, tempZip);
  try {
    // The pack wraps everything in BepInExPack_V_Rising/ — stripped so
    // doorstop_config.ini and BepInEx/ land at the server root.
    extractCorePack(new AdmZip(tempZip), vrisingDir);
  } catch (err: any) {
    throw new Error(`Failed to extract BepInExPack_V_Rising: ${err.message}`);
  } finally {
    try { fs.unlinkSync(tempZip); } catch (_) {}
  }

  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "thunderstore", packageId: VRISING_CORE_PACKAGE_ID } },
    update: { version: versionEntry.version_number },
    create: {
      serverId,
      provider: "thunderstore",
      packageId: VRISING_CORE_PACKAGE_ID,
      version: versionEntry.version_number,
      name: "BepInExPack V Rising",
    },
  });
}

/**
 * Install a Thunderstore package into a V Rising server's BepInEx plugins
 * dir, mirroring the Valheim flow. Auto-installs the community BepInEx core
 * pack (IL2CPP) when it's missing.
 */
export async function installVRisingThunderstore(args: {
  serverId: string;
  vrisingDir: string;
  packageId: string;
  name?: string;
  /** Pinned version number (e.g. from a collection export); falls back to newest. */
  versionNumber?: string;
  downloadUrl?: string;
  warnings: string[];
}): Promise<InstallStepResult> {
  const { serverId, vrisingDir } = args;
  return installBepInExThunderstore({
    serverId,
    serverDir: vrisingDir,
    community: communityForGame("VRISING")!,
    ensureCore: () => ensureVRisingCore(serverId, vrisingDir, false),
    packageId: args.packageId,
    name: args.name,
    versionNumber: args.versionNumber,
    downloadUrl: args.downloadUrl,
    warnings: args.warnings,
  });
}

/**
 * (Re-)provision the V Rising BepInEx core pack unconditionally — the
 * route's BEPINEX modType path, mirroring Valheim's "Install BepInEx" card.
 */
export async function installVRisingBepInexCore(args: {
  serverId: string;
  vrisingDir: string;
}): Promise<void> {
  await ensureVRisingCore(args.serverId, args.vrisingDir, true);
}

/**
 * Register a Project Zomboid workshop mod: merge it into servertest.ini's
 * WorkshopItems=/Mods= keys and record a row keyed by the Workshop ID (with
 * the ini mod IDs stored alongside, so uninstall can strip both keys).
 *
 * The ini mod ID is not in the Steam Web API — when the caller has none
 * (live search results), the item is downloaded with SteamCMD into the
 * server's Steam dir (a boot pre-cache) and the ids are derived from its
 * mod.info files. One item can carry several mod folders; the row stores
 * them ';'-joined.
 */
export async function installZomboidWorkshopMod(args: {
  serverId: string;
  serverRoot: string;
  workshopId: string;
  modId?: string;
  name?: string;
  /** Pre-fetched item time_updated (ISO); stored as the row version. */
  version?: string;
  deps?: {
    downloadWorkshop?: typeof downloadWorkshopItem;
    deriveZomboid?: typeof deriveZomboidModIds;
  };
}): Promise<void> {
  const { serverId, serverRoot, workshopId, modId, name, version } = args;

  let modIds: string[];
  let displayName = name;
  if (modId) {
    modIds = [modId];
  } else {
    const pzDir = path.join(serverRoot, "zomboid-server");
    if (!fs.existsSync(pzDir)) {
      throw new Error("Project Zomboid server is not installed yet — install the server before adding Workshop mods.");
    }
    const contentDir = await (args.deps?.downloadWorkshop ?? downloadWorkshopItem)({
      appId: WORKSHOP_APP_IDS.ZOMBOID,
      workshopId,
      installDir: pzDir,
    });
    const derived = (args.deps?.deriveZomboid ?? deriveZomboidModIds)(contentDir);
    modIds = derived.map((d) => d.modId);
    displayName = displayName ?? derived[0]?.name ?? undefined;
  }

  addZomboidWorkshopMod(zomboidServerIniPath(serverRoot), workshopId, modIds);
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "workshop", packageId: workshopId } },
    update: { name: displayName || `Workshop ${workshopId}`, workshopModId: modIds.join(";"), ...(version ? { version } : {}) },
    create: {
      serverId, provider: "workshop", packageId: workshopId,
      version: version || "Workshop", name: displayName || `Workshop ${workshopId}`, workshopModId: modIds.join(";"),
    },
  });
}

/**
 * Register an ARK: Survival Evolved workshop mod: append its Workshop ID to
 * GameUserSettings.ini's ActiveMods= (order = load order) and record a row.
 * Unlike Zomboid there is a single id space — the Workshop file id IS the
 * ActiveMods entry, so no workshopModId is stored. The dedicated server
 * downloads and updates the mod itself on startup via -automanagemods,
 * which the ARK launch spec carries.
 */
export async function installArkWorkshopMod(args: {
  serverId: string;
  serverRoot: string;
  workshopId: string;
  name?: string;
  version?: string;
}): Promise<void> {
  const { serverId, serverRoot, workshopId, name, version } = args;
  const arkDir = path.join(serverRoot, "ark-server");
  if (!fs.existsSync(arkDir)) {
    throw new Error("ARK server is not installed yet — install the server before adding Workshop mods.");
  }
  addArkActiveMod(arkGameUserSettingsIniPath(serverRoot), workshopId);
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "workshop", packageId: workshopId } },
    update: { name: name || `Workshop ${workshopId}`, ...(version ? { version } : {}) },
    create: {
      serverId, provider: "workshop", packageId: workshopId,
      version: version || "Workshop", name: name || `Workshop ${workshopId}`,
    },
  });
}

/**
 * Install the tModLoader dedicated server (Steam app 1281930) beside the
 * vanilla Terraria server and mark it — the marker is what makes LocalRunner
 * swap the launch. tML runs its own copy of everything (dotnet included via
 * its depots); the vanilla install stays untouched, and the world stays in
 * terraria-server/worlds (the launch redirects -world back there), so one
 * world remains playable under either runtime and backups stay put.
 * No ModInstallation row: like Minecraft loaders, the marker alone carries
 * state (loader GET reads it; a restore removes it).
 */
export async function installTmlLoader(args: {
  serverRoot: string;
  onLog?: (msg: string) => void;
  deps?: { installApp?: typeof installSteamApp };
}): Promise<void> {
  const installDir = tmlInstallDir(args.serverRoot);
  fs.mkdirSync(installDir, { recursive: true });
  await (args.deps?.installApp ?? installSteamApp)({
    appId: WORKSHOP_APP_IDS.TERRARIA,
    installDir,
    validate: true,
    onLog: args.onLog,
  });

  // Honest install check: the Windows start script and the managed entrypoint
  // are the two artifacts the runner's launch swap depends on.
  for (const required of ["start-tModLoaderServer.bat", "tModLoader.dll"]) {
    if (!fs.existsSync(path.join(installDir, required))) {
      throw new Error(
        `tModLoader installed but ${required} is missing — the Steam depot layout changed; refusing to mark it active.`
      );
    }
  }
  if (readTmlMarker(installDir)) return;
  writeTmlMarker(installDir, { type: "tmodloader", installedAt: new Date().toISOString() });
}

/**
 * Register a tModLoader Workshop mod: SteamCMD-download the item into the tML
 * install's own workshop dir (where -steamworkshopfolder points the server),
 * derive the mod names from its .tmod files, and enable them in
 * tModLoader-server/Mods/enabled.json — tML picks the right .tmod version
 * folder itself at boot. Refuses client-only items (their own workshop.json
 * tags say so) and items that carry no .tmod at all.
 */
export async function installTmlWorkshopMod(args: {
  serverId: string;
  serverRoot: string;
  workshopId: string;
  name?: string;
  /** Pre-fetched item time_updated (ISO); stored as the row version. */
  version?: string;
  deps?: {
    downloadWorkshop?: typeof downloadWorkshopItem;
    derive?: typeof deriveTmodNames;
  };
}): Promise<void> {
  const { serverId, serverRoot, workshopId, name, version } = args;
  const installDir = tmlInstallDir(serverRoot);
  if (!readTmlMarker(installDir)) {
    throw new Error("tModLoader is not installed on this server — install it from the Mod Manager first.");
  }

  const contentDir = await (args.deps?.downloadWorkshop ?? downloadWorkshopItem)({
    appId: WORKSHOP_APP_IDS.TERRARIA,
    workshopId,
    installDir,
  });
  if (isClientOnlyWorkshopItem(contentDir)) {
    throw new Error("This Workshop item is tagged client-only — it changes the game UI, not the server, and would never load here.");
  }
  const derived = (args.deps?.derive ?? deriveTmodNames)(contentDir);
  const modNames = derived.map((d) => d.name);

  addTmlEnabledMods(tmlEnabledJsonPath(installDir), modNames);
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "workshop", packageId: workshopId } },
    update: {
      name: name || `Workshop ${workshopId}`,
      workshopModId: modNames.join(";"),
      ...(version ? { version } : {}),
    },
    create: {
      serverId, provider: "workshop", packageId: workshopId,
      version: version || "Workshop", name: name || `Workshop ${workshopId}`,
      workshopModId: modNames.join(";"),
    },
  });
}

/**
 * Palworld: ensure the Thunderstore unreal_shimloader core (the UE4SS shim)
 * is present. Its zip is an overlay wrapper — dwmapi.dll proxy + the UE4SS
 * bundle — extracted whole into overlay/<full_name>/ and activated by
 * runner-injected --mod-dir/--pak-dir/--cfg-dir/--overlay-dir launch args
 * (see LocalRunner + palworld.ts).
 */
export async function ensureShimloaderCore(serverId: string, palworldDir: string): Promise<void> {
  if (fs.existsSync(shimloaderMarkerPath(palworldDir))) return;

  const index = await fetchCommunityIndex(communityForGame("PALWORLD")!);
  const corePkg = index.find((p) => p.full_name === SHIMLOADER_PACKAGE_ID);
  const versionEntry = corePkg ? newestVersion(corePkg) : null;
  if (!corePkg || !versionEntry) {
    throw new Error("unreal_shimloader is no longer available on Thunderstore — it is required for Palworld mods.");
  }

  const tempZip = uniqueStagingZip(palworldDir, "shimloader");
  await downloadFile(versionEntry.download_url, tempZip);
  try {
    // The wrapper keeps its zip layout (dwmapi.dll + UE4SS/ at the root) —
    // shimloader overlays the tree onto Pal/Binaries/Win64 at boot.
    extractThunderstorePackage(new AdmZip(tempZip), path.join(palworldDir, PALWORLD_OVERLAY_DIR, SHIMLOADER_PACKAGE_ID));
  } catch (err: any) {
    throw new Error(`Failed to extract unreal_shimloader: ${err.message}`);
  } finally {
    try { fs.unlinkSync(tempZip); } catch (_) {}
  }

  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "thunderstore", packageId: SHIMLOADER_PACKAGE_ID } },
    update: { version: versionEntry.version_number },
    create: {
      serverId, provider: "thunderstore", packageId: SHIMLOADER_PACKAGE_ID,
      version: versionEntry.version_number, name: "unreal_shimloader (UE4SS)",
    },
  });
}

/**
 * Install a Thunderstore package into a Palworld server via shimloader's
 * manager dirs (mods/ paks/ cfgs/ overlay/). Provisions the shimloader core
 * first when missing. Package layouts are classified by planPalworldPackage;
 * unknown layouts are refused before anything is written.
 */
export async function installPalworldThunderstore(args: {
  serverId: string;
  palworldDir: string;
  packageId: string;
  name?: string;
  /** Pinned version number (e.g. from a collection export); falls back to newest. */
  versionNumber?: string;
  downloadUrl?: string;
  warnings: string[];
}): Promise<InstallStepResult> {
  const { serverId, palworldDir, packageId, name, versionNumber, downloadUrl, warnings } = args;

  await ensureShimloaderCore(serverId, palworldDir);

  const index = await fetchCommunityIndex(communityForGame("PALWORLD")!);
  const pkg = index.find((p) => p.full_name === packageId);
  if (!pkg) {
    throw new Error(`Package '${packageId}' not found on the Palworld Thunderstore community.`);
  }
  const versionEntry = findVersionEntry(pkg, { versionNumber, downloadUrl });
  if (!versionEntry) {
    throw new Error(`Version '${versionNumber}' of '${packageId}' is no longer available on Thunderstore.`);
  }

  const tempZip = uniqueStagingZip(palworldDir, "palworld-mod");
  await downloadFile(versionEntry.download_url, tempZip);
  let zip: AdmZip;
  try {
    zip = new AdmZip(tempZip);
    const plan = planPalworldPackage({ zip, fullName: packageId, packageName: pkg.name });
    applyPalworldPlan({ zip, palworldDir, plan });
  } catch (err: any) {
    throw new Error(err.message);
  } finally {
    try { fs.unlinkSync(tempZip); } catch (_) {}
  }

  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "thunderstore", packageId } },
    update: { name: name || pkg.name, version: versionEntry.version_number },
    create: {
      serverId, provider: "thunderstore", packageId,
      version: versionEntry.version_number, name: name || pkg.name,
    },
  });
  return { dependencyCount: 0 };
}

/** The SML boot loader row (installed like any ficsit mod, resolved by reference). */
export async function ensureFicsitSml(serverId: string, satisfactoryDir: string, warnings: string[]): Promise<void> {
  if (fs.existsSync(path.join(satisfactoryDir, "FactoryGame", "Mods", FICSIT_SML_REFERENCE, "SML.uplugin"))) return;

  const sml = await getFicsitModByReference(FICSIT_SML_REFERENCE);
  if (!sml) {
    throw new Error("SML is no longer available on ficsit.app — it is required for Satisfactory mods.");
  }
  await installFicsitMod({ serverId, satisfactoryDir, modId: sml.id, warnings });
}

/**
 * Install a ficsit.app mod (or the SML core) into a Satisfactory dedicated
 * server: the version's WindowsServer zip extracts to
 * FactoryGame/Mods/<mod_reference>/ with a `.smm` hash marker, exactly the
 * layout ficsit-cli/SMR manage. Client-only mods (no WindowsServer target)
 * refuse closed before anything is written. The mod is accepted as its
 * GraphQL id OR its stable reference (search cards ship both; collections
 * ship the reference) — resolution tries the exact reference filter first,
 * then the id lookup.
 */
export async function installFicsitMod(args: {
  serverId: string;
  satisfactoryDir: string;
  /** ficsit.app GraphQL id or stable mod reference. */
  modId: string;
  versionNumber?: string;
  warnings: string[];
  /** Injected by tests; real installs resolve dependencies recursively. */
  skipDependencies?: boolean;
}): Promise<{ dependencyCount: number }> {
  const { serverId, satisfactoryDir, modId, versionNumber, warnings, skipDependencies } = args;

  let modIdResolved = modId;
  let byRef = await getFicsitModByReference(modId);
  if (byRef) {
    modIdResolved = byRef.id;
  } else {
    byRef = await getFicsitModVersion({ modId, versionNumber }).then((r) => r?.mod ?? null);
    if (!byRef) {
      throw new Error(`'${modId}' not found on ficsit.app.`);
    }
  }
  const resolved = await getFicsitModVersion({ modId: modIdResolved, versionNumber });
  if (!resolved) {
    throw new Error(
      `'${byRef.name}' is not available on ficsit.app${versionNumber ? ` in version ${versionNumber} — the author may have removed it` : " (no release version)"}.`
    );
  }
  return installResolvedFicsit({ serverId, satisfactoryDir, resolved, warnings, skipDependencies });
}

async function installResolvedFicsit(args: {
  serverId: string;
  satisfactoryDir: string;
  resolved: NonNullable<Awaited<ReturnType<typeof getFicsitModVersion>>>;
  warnings: string[];
  skipDependencies?: boolean;
  /** References already resolved on this install walk — guards dependency cycles. */
  visited?: Set<string>;
}): Promise<{ dependencyCount: number }> {
  const { serverId, satisfactoryDir, resolved, warnings, skipDependencies } = args;
  const { mod, version } = resolved;
  const visited = args.visited ?? new Set<string>([mod.modReference]);

  const downloadUrl = pickFicsitServerDownload(version);
  if (!downloadUrl) {
    throw new Error(
      `'${mod.name}' has no WindowsServer build — its latest release only ships client files, which won't work on a dedicated server.`
    );
  }

  // SML is a dependency of everything except itself.
  let dependencyCount = 0;
  if (!skipDependencies && mod.modReference !== FICSIT_SML_REFERENCE) {
    await ensureFicsitSml(serverId, satisfactoryDir, warnings);
    dependencyCount += 1;
    for (const dep of version.dependencies ?? []) {
      if (dep.optional) continue;
      const depResolved = await getFicsitModVersion({ modId: dep.mod_id });
      if (!depResolved) {
        warnings.push(`A required dependency (${dep.mod_id}) is no longer available on ficsit.app — the server may fail to boot without it.`);
        continue;
      }
      if (visited.has(depResolved.mod.modReference)) continue; // cycle / already planned
      visited.add(depResolved.mod.modReference);
      const depDir = path.join(satisfactoryDir, "FactoryGame", "Mods", depResolved.mod.modReference);
      if (fs.existsSync(depDir)) continue; // installed (or user-managed) — leave it
      // Recurse WITHOUT skipDependencies: a dep's own deps would otherwise be
      // silently dropped (only SML was provisioned transitively before).
      await installResolvedFicsit({ serverId, satisfactoryDir, resolved: depResolved, warnings, visited });
      dependencyCount += 1;
    }
  }

  const modsRoot = path.join(satisfactoryDir, "FactoryGame", "Mods");
  const modDir = safeJoin(modsRoot, mod.modReference);
  fs.mkdirSync(modDir, { recursive: true });

  const tempZip = uniqueStagingZip(satisfactoryDir, "ficsit-mod");
  await downloadFile(downloadUrl, tempZip);
  try {
    // Zip entries are rooted at the plugin files (no wrapper dir); extract
    // per-entry re-anchored so a hostile archive can't escape the mod dir.
    extractThunderstorePackage(new AdmZip(tempZip), modDir);
  } catch (err: any) {
    throw new Error(`Failed to extract '${mod.name}': ${err.message}`);
  } finally {
    try { fs.unlinkSync(tempZip); } catch (_) {}
  }

  // ficsit-cli's own marker: its hash-check then treats this as a managed
  // install instead of "unknown mod state".
  if (version.hash) {
    fs.writeFileSync(path.join(modDir, FICSIT_SMM_MARKER), version.hash);
  }

  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "ficsit", packageId: mod.modReference } },
    update: { name: mod.name, version: version.version },
    create: {
      serverId, provider: "ficsit", packageId: mod.modReference,
      version: version.version, name: mod.name,
    },
  });
  return { dependencyCount };
}

/** Remove a mod's FactoryGame/Mods/<reference> directory (SML included). */
export function removeFicsitMod(satisfactoryDir: string, packageId: string): void {
  fs.rmSync(path.join(satisfactoryDir, "FactoryGame", "Mods", packageId), { recursive: true, force: true });
}
