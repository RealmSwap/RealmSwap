import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/db";
import { downloadFile } from "@/lib/download";
import { safeJoin } from "@/lib/safePath";
import { detectModLoader, type LoaderMarker, type LoaderType } from "@/lib/mods/mcLoaders";
import {
  FABRIC_META, QUILT_META, FORGE_PROMOTIONS, NEOFORGE_MAVEN,
  javaMajorForMinecraft, pickForgeVersion, forgeInstallerUrl,
  neoforgeInstallerUrl, pickNeoforgeVersion,
} from "@/lib/mods/mcLoaders";
import {
  resolveInstallCandidate, fetchVersions, pickCompatibleVersion, primaryFile, collectRequiredDependencies,
} from "@/lib/mods/modrinth";
import {
  resolveCfInstall, collectRequiredCfMods, resolveCompatibleProjectFile, curseForgeDownloadUrl, getCurseForgeMods,
  getCurseForgeModFiles, pickCompatibleCfFile,
} from "@/lib/mods/curseforge";
import {
  communityForGame, fetchCommunityIndex, findVersionEntry, newestVersion,
  collectDependencies, extractThunderstorePackage, extractCorePack, isBepInExCore,
} from "@/lib/mods/thunderstore";
import {
  OXIDE_CORE_MARKER, OXIDE_CORE_PACKAGE_ID, OXIDE_CORE_DOWNLOAD_URL, fetchUmodPluginMeta,
} from "@/lib/mods/umod";
import { addZomboidWorkshopModContent } from "@/lib/mods/zomboid";
import { addArkActiveModContent } from "@/lib/mods/ark";
import { UpdateResolutionError } from "@/lib/mods/updateApply";
import { agentReadServerFile, agentWriteServerFile, agentListServerDir } from "@/lib/agents/agentFiles";
import {
  shipModTree, makeModStagingRoot, runNodeContainer, scanNodeFiles, rollbackAgentModShip, snapshotNodePaths,
} from "@/lib/agents/agentMods";
import { WORKSHOP_APP_IDS } from "@/lib/mods/workshop";

/**
 * Per-game mod installation for AGENT (remote-node) servers. Mirrors
 * installers.ts: same providers, same resolution, same rows — but every file
 * lands in a dashboard-side staging tree laid out like the server data dir
 * and ships to the node as one tar (agentMods). Rows are written only after
 * the ship succeeds; the node tar-asides the affected paths first so the
 * ROUTE can roll a failed ship back automatically (there is no sandbox boot
 * test on a node — routes say so instead of pretending).
 */

const STEAMCMD_IMAGE = "cm2network/steamcmd";

export interface RemoteInstallResult {
  dependencyCount: number;
}

/** A ship failed but the node holds a rollback snapshot for it. */
export class RemoteShipError extends Error {
  snapshotId?: string;
  clearPaths: string[];
  constructor(message: string, snapshotId: string | undefined, clearPaths: string[]) {
    super(message);
    this.snapshotId = snapshotId;
    this.clearPaths = clearPaths;
  }
}

/** Ship a staging tree, mapping a node-side failure to RemoteShipError so the
 *  route can roll back with the snapshot the agent already took. */
async function ship(serverId: string, stagingRoot: string, opts: { deletes?: string[]; backupPaths?: string[] }): Promise<void> {
  try {
    await shipModTree(serverId, stagingRoot, opts);
  } catch (err: any) {
    let snapshotId: string | undefined;
    try {
      const parsed = JSON.parse(err?.output ?? "null");
      if (typeof parsed?.snapshotId === "string") snapshotId = parsed.snapshotId;
    } catch { /* no snapshot info — nothing existed to back up */ }
    throw new RemoteShipError(err?.message ?? String(err), snapshotId, opts.deletes ?? []);
  }
}

/** Route-side rollback helper for RemoteShipError. */
export async function rollbackRemoteInstall(serverId: string, err: RemoteShipError): Promise<void> {
  if (err.snapshotId) {
    await rollbackAgentModShip(serverId, err.snapshotId, err.clearPaths).catch(() => {});
  }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

function mkdirp(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Shared remote state reads ──────────────────────────────────────────────

const LOADER_MARKER_REL = "realmswap-loader.json";

export async function readRemoteLoaderMarker(serverId: string): Promise<LoaderMarker | null> {
  const remote = await agentReadServerFile(serverId, LOADER_MARKER_REL);
  if (!remote.exists || remote.content === null) return null;
  try {
    const parsed = JSON.parse(remote.content);
    if (typeof parsed?.type === "string") return parsed as LoaderMarker;
  } catch { /* corrupt marker — treat as absent */ }
  return null;
}

/** The Minecraft version of a node server: the loader marker's pinned
 *  version, or — for a vanilla server — version.json extracted out of the
 *  node's server.jar by a throwaway JDK container (the jar is too big to
 *  ferry over the command channel). */
export async function detectRemoteMinecraftVersion(serverId: string): Promise<string | null> {
  const marker = await readRemoteLoaderMarker(serverId);
  if (marker?.minecraftVersion) return marker.minecraftVersion;
  const output = await runNodeContainer(
    serverId,
    "eclipse-temurin:25-jdk",
    `cd /data && rm -rf .rs-version && mkdir .rs-version && cd .rs-version ` +
    `&& jar xf ../server.jar version.json && cat version.json; cd /data && rm -rf .rs-version`,
    5 * 60_000,
  ).catch(() => "");
  const match = output.match(/"id"\s*:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

// ─── Minecraft jar mods ─────────────────────────────────────────────────────

async function shipJarSet(
  serverId: string,
  jars: { packageId: string; url: string }[],
  mainInspect: { packageId: string; title: string } | null,
  marker: LoaderMarker | null
): Promise<void> {
  const staging = await makeModStagingRoot(serverId);
  try {
    const modsDir = mkdirp(path.join(staging, "mods"));
    for (const jar of jars) {
      await downloadFile(jar.url, safeJoin(modsDir, `${jar.packageId}.jar`));
    }
    if (mainInspect) {
      // Loader gate on the jar manifest — identical rule to the local flow.
      const jarPath = safeJoin(modsDir, `${mainInspect.packageId}.jar`);
      const needsLoader = detectModLoader(jarPath);
      if (needsLoader) {
        const satisfied =
          !!marker &&
          (marker.type === needsLoader || (marker.type === "neoforge" && needsLoader === "forge"));
        if (!satisfied) {
          const loaderName = { fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge" }[needsLoader];
          throw new Error(
            `'${mainInspect.title}' requires the ${needsLoader} loader, which isn't installed on this server. Install ${loaderName} first (Installed tab → Install Loader).`
          );
        }
      }
    }
    await ship(serverId, staging, { backupPaths: ["mods"] });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export async function installMinecraftModRemote(args: {
  serverId: string;
  projectId: string;
  versionNumber?: string;
  warnings: string[];
}): Promise<RemoteInstallResult> {
  const { serverId, projectId, versionNumber, warnings } = args;
  const marker = await readRemoteLoaderMarker(serverId);
  const gameVersion = await detectRemoteMinecraftVersion(serverId);
  const loader = marker?.type ?? null;

  const candidate = await resolveInstallCandidate(projectId, { gameVersion, loader, versionNumber });
  if (candidate.project.server_side === "unsupported") {
    throw new Error(`'${candidate.project.title}' is a client-side mod — it cannot run on a server.`);
  }
  if (candidate.project.server_side === "optional") {
    warnings.push(`'${candidate.project.title}' is primarily a client mod; the server-side part may be optional.`);
  }

  const installedProjectIds = new Set(
    (await prisma.modInstallation.findMany({ where: { serverId }, select: { packageId: true } }))
      .map((m) => m.packageId)
  );
  const { order: depVersions, missingProjects } = await collectRequiredDependencies(
    candidate.version,
    async (pid) => {
      const versions = await fetchVersions(pid);
      const v = pickCompatibleVersion(versions, { gameVersion, loader });
      return v && primaryFile(v) ? v : null;
    },
    (id) => installedProjectIds.has(id)
  );
  for (const depId of missingProjects) {
    warnings.push(`Dependency ${depId} has no compatible version${gameVersion ? ` for Minecraft ${gameVersion}` : ""} — the mod may not work without it.`);
  }

  const jars = depVersions.map((v) => ({
    packageId: v.project_id,
    url: primaryFile(v)!.url,
  }));
  const main = { packageId: candidate.project.id, url: candidate.file.url };

  await shipJarSet(serverId, [...jars, main], { packageId: main.packageId, title: candidate.project.title }, marker);

  for (const dep of depVersions) {
    const file = primaryFile(dep)!;
    await prisma.modInstallation.upsert({
      where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId: dep.project_id } },
      update: { version: dep.version_number },
      create: { serverId, provider: "modrinth", packageId: dep.project_id, version: dep.version_number, name: dep.project_id },
    });
  }
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId: candidate.project.id } },
    update: {
      version: candidate.version.version_number,
      name: candidate.project.title,
      dependencies: JSON.stringify(depVersions.map((d) => d.project_id)),
    },
    create: {
      serverId, provider: "modrinth", packageId: candidate.project.id,
      version: candidate.version.version_number, name: candidate.project.title,
      dependencies: JSON.stringify(depVersions.map((d) => d.project_id)),
    },
  });
  return { dependencyCount: depVersions.length };
}

export async function installMinecraftCurseforgeRemote(args: {
  serverId: string;
  modId: string;
  version?: string;
  warnings: string[];
}): Promise<RemoteInstallResult> {
  const { serverId, modId, version, warnings } = args;
  const marker = await readRemoteLoaderMarker(serverId);
  const gameVersion = await detectRemoteMinecraftVersion(serverId);
  const loader = marker?.type ?? null;

  const candidate = await resolveCfInstall(modId, { mcVersion: gameVersion, loader, displayName: version });

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

  await shipJarSet(
    serverId,
    [
      ...depFiles.map((f) => ({ packageId: f.modId.toString(), url: curseForgeDownloadUrl(f) })),
      { packageId: candidate.mod.id.toString(), url: curseForgeDownloadUrl(candidate.file) },
    ],
    { packageId: candidate.mod.id.toString(), title: candidate.mod.name },
    marker
  );

  const depModIds = Array.from(new Set(depFiles.map((f) => f.modId)));
  const depNames = depModIds.length > 0 ? new Map((await getCurseForgeMods(depModIds)).map((m) => [m.id, m.name])) : new Map<number, string>();
  for (const dep of depFiles) {
    await prisma.modInstallation.upsert({
      where: { serverId_provider_packageId: { serverId, provider: "curseforge", packageId: dep.modId.toString() } },
      update: { version: dep.displayName },
      create: {
        serverId, provider: "curseforge", packageId: dep.modId.toString(),
        version: dep.displayName, name: depNames.get(dep.modId) || dep.fileName,
      },
    });
  }
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

// ─── Minecraft loaders ──────────────────────────────────────────────────────

/** The download-tool preamble container entrypoints use — temurin images
 *  ship without curl AND wget. */
const FETCH_PREAMBLE =
  `fetch=""; command -v curl >/dev/null 2>&1 && fetch="curl -fsSL -o"; ` +
  `if [ -z "$fetch" ] && command -v wget >/dev/null 2>&1; then fetch="wget -q -O"; fi; ` +
  `if [ -z "$fetch" ]; then (apt-get update -qq && apt-get install -y -qq curl >/dev/null 2>&1) && fetch="curl -fsSL -o"; fi; ` +
  `if [ -z "$fetch" ]; then echo "No download tool available in image" >&2; exit 1; fi`;

export async function installMcLoaderRemote(args: {
  serverId: string;
  loader: LoaderType;
  minecraftVersion: string;
  onLog?: (msg: string) => void;
}): Promise<LoaderMarker> {
  const { serverId, loader, minecraftVersion } = args;
  const onLog = args.onLog ?? (() => {});

  if (loader === "fabric") {
    // The launcher jar is a plain download — no installer to run.
    const loaders: any[] = await fetchJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(minecraftVersion)}`);
    const stable = loaders.find((l) => l?.loader?.stable) ?? loaders[0];
    const loaderVersion: string | undefined = stable?.loader?.version;
    if (!loaderVersion) throw new Error(`No Fabric loader available for Minecraft ${minecraftVersion}`);
    const installers: any[] = await fetchJson(`${FABRIC_META}/versions/installer`);
    const installerVersion: string | undefined = installers[0]?.version;
    if (!installerVersion) throw new Error("No Fabric installer version available");
    const jarUrl = `${FABRIC_META}/versions/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(loaderVersion)}/${encodeURIComponent(installerVersion)}/server/jar`;

    const staging = await makeModStagingRoot(serverId);
    try {
      await downloadFile(jarUrl, path.join(staging, "fabric-server-launch.jar"));
      await ship(serverId, staging, {
        backupPaths: ["mods", "realmswap-loader.json", "fabric-server-launch.jar"],
      });
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    const marker: LoaderMarker = {
      type: "fabric", loaderVersion, minecraftVersion,
      installedAt: new Date().toISOString(),
      launch: { kind: "jar", file: "fabric-server-launch.jar" },
    };
    await agentWriteServerFile(serverId, LOADER_MARKER_REL, JSON.stringify(marker, null, 2) + "\n");
    return marker;
  }

  // Quilt/Forge/NeoForge ship real installers — run them ON the node in a
  // throwaway JDK container against /data, exactly what LocalRunner does on
  // the Windows host. The node tar-asides the loader-touched paths first so
  // a failed installer rolls back.
  let installerUrl: string;
  let installerName: string;
  let loaderVersion: string;
  const javaMajor = Math.max(javaMajorForMinecraft(minecraftVersion), 17);
  const jdkImage = `eclipse-temurin:${javaMajor}-jdk`;

  if (loader === "quilt") {
    const loaders: any[] = await fetchJson(`${QUILT_META}/versions/loader/${encodeURIComponent(minecraftVersion)}`);
    loaderVersion = loaders[0]?.loader?.version;
    if (!loaderVersion) throw new Error(`No Quilt loader available for Minecraft ${minecraftVersion}`);
    const installers: any[] = await fetchJson(`${QUILT_META}/versions/installer`);
    installerUrl = installers[0]?.url;
    installerName = `quilt-installer-${installers[0]?.version}.jar`;
    if (!installerUrl) throw new Error("No Quilt installer version available");
  } else if (loader === "forge") {
    const promotions = await fetchJson(FORGE_PROMOTIONS);
    loaderVersion = pickForgeVersion(promotions?.promos ?? {}, minecraftVersion) ?? "";
    if (!loaderVersion) throw new Error(`No Forge build is available for Minecraft ${minecraftVersion}.`);
    installerUrl = forgeInstallerUrl(minecraftVersion, loaderVersion);
    installerName = `forge-${minecraftVersion}-${loaderVersion}-installer.jar`;
  } else {
    const listing: any = await fetchJson(`${NEOFORGE_MAVEN}/api/maven/versions/releases/net/neoforged/neoforge`);
    loaderVersion = pickNeoforgeVersion(listing?.versions ?? [], minecraftVersion) ?? "";
    if (!loaderVersion) throw new Error(`No NeoForge build is available for Minecraft ${minecraftVersion} (NeoForge supports 1.20.2 and newer).`);
    installerUrl = neoforgeInstallerUrl(loaderVersion);
    installerName = `neoforge-${loaderVersion}-installer.jar`;
  }

  // Snapshot the loader-touched paths on the node BEFORE the installer runs.
  const snap = await snapshotNodePaths(serverId, [
    "libraries", "mods", LOADER_MARKER_REL,
    "fabric-server-launch.jar", "quilt-server-launch.jar",
  ]);
  try {
    const runArgs =
      loader === "quilt"
        ? `java -jar ${installerName} install server ${minecraftVersion} ${loaderVersion} --install-dir=/data`
        : javaMajorForMinecraft(minecraftVersion) > 8
          ? `java -jar ${installerName} --installServer /data`
          : `java -jar ${installerName} --installServer`;
    await runNodeContainer(
      serverId,
      jdkImage,
      `cd /data && ${FETCH_PREAMBLE} && $fetch ${installerName} '${installerUrl}' && ${runArgs}; code=$?; ` +
      `rm -f ${installerName}; exit $code`,
      10 * 60_000,
    );
    // Verify what the installer produced (launch discovery over listings).
    const marker = await verifyRemoteLoaderInstall(serverId, loader, loaderVersion, minecraftVersion);
    await agentWriteServerFile(serverId, LOADER_MARKER_REL, JSON.stringify(marker, null, 2) + "\n");
    return marker;
  } catch (err: any) {
    if (snap) await rollbackAgentModShip(serverId, snap, []).catch(() => {});
    throw err;
  }
}

async function verifyRemoteLoaderInstall(
  serverId: string,
  loader: "quilt" | "forge" | "neoforge",
  loaderVersion: string,
  minecraftVersion: string
): Promise<LoaderMarker> {
  const root = await agentListServerDir(serverId, "");
  if (loader === "quilt") {
    if (!root.some((e) => e.name === "quilt-server-launch.jar")) {
      throw new Error("The Quilt installer completed but produced no quilt-server-launch.jar.");
    }
    return {
      type: "quilt", loaderVersion, minecraftVersion,
      installedAt: new Date().toISOString(),
      launch: { kind: "jar", file: "quilt-server-launch.jar" },
    };
  }
  // Forge/NeoForge: unix_args.txt under libraries/<group>/<artifact>/<version>/
  // (containers are Linux) — or the legacy forge universal jar at the root.
  const groupDir = loader === "neoforge" ? "libraries/net/neoforged/neoforge" : "libraries/net/minecraftforge/forge";
  const versions = await agentListServerDir(serverId, groupDir).catch(() => []);
  for (const v of versions) {
    if (!v.isDir) continue;
    const argsDir = await agentListServerDir(serverId, `${groupDir}/${v.name}`).catch(() => []);
    if (argsDir.some((e) => e.name === "unix_args.txt")) {
      return {
        type: loader, loaderVersion, minecraftVersion,
        installedAt: new Date().toISOString(),
        launch: { kind: "argsFile", file: `${groupDir}/${v.name}/unix_args.txt` },
      };
    }
  }
  if (loader === "forge") {
    const universal = root.find((e) => e.name.startsWith("forge-") && e.name.endsWith("-universal.jar"));
    if (universal) {
      return {
        type: "forge", loaderVersion, minecraftVersion,
        installedAt: new Date().toISOString(),
        launch: { kind: "jar", file: universal.name },
      };
    }
  }
  throw new Error(`The installer completed but produced no recognizable launch files (no ${loader} args file or universal jar). Installation rolled back.`);
}

// ─── ARK / Zomboid (ini + on-node SteamCMD) ────────────────────────────────

export async function installArkWorkshopModRemote(args: {
  serverId: string;
  workshopId: string;
  name?: string;
  version?: string;
}): Promise<void> {
  const { serverId, workshopId, name, version } = args;
  const iniRel = "ark-server/ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini";
  const remote = await agentReadServerFile(serverId, iniRel);
  const updated = addArkActiveModContent(remote.exists ? remote.content ?? "" : "", workshopId);
  await agentWriteServerFile(serverId, iniRel, updated, { backup: true });
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "workshop", packageId: workshopId } },
    update: { name: name || `Workshop ${workshopId}`, ...(version ? { version } : {}) },
    create: {
      serverId, provider: "workshop", packageId: workshopId,
      version: version || "Workshop", name: name || `Workshop ${workshopId}`,
    },
  });
}

export async function installZomboidWorkshopModRemote(args: {
  serverId: string;
  workshopId: string;
  modId?: string;
  name?: string;
  version?: string;
}): Promise<void> {
  const { serverId, workshopId, modId, name, version } = args;

  let modIds: string[];
  let displayName = name;
  if (modId) {
    modIds = [modId];
  } else {
    // Download the item with SteamCMD on the node (the container image ships
    // it; the dashboard host may not be Windows), then derive the ini mod IDs
    // from the downloaded mod.info files.
    const appId = WORKSHOP_APP_IDS.ZOMBOID;
    await runNodeContainer(
      serverId,
      STEAMCMD_IMAGE,
      `steamcmd_bin="\${STEAMCMDDIR:+\$STEAMCMDDIR/steamcmd.sh}"; steamcmd_bin="\${steamcmd_bin:-steamcmd}"; ` +
      `"$steamcmd_bin" +force_install_dir /data/zomboid-server +login anonymous ` +
      `+workshop_download_item ${appId} ${workshopId} +quit`,
      15 * 60_000,
    );
    const contentRel = `zomboid-server/steamapps/workshop/content/${appId}/${workshopId}`;
    const infos = await scanNodeFiles(serverId, contentRel, "mod.info", [
      { key: "id", regex: "^id=(.+)$" },
      { key: "name", regex: "^name=(.+)$" },
    ]);
    modIds = infos.map((f) => f.fields.id).filter((id): id is string => !!id);
    if (modIds.length === 0) {
      throw new Error(
        `Workshop item ${workshopId} downloaded on the node but exposed no mod.info id= entries — its content layout isn't a server mod.`
      );
    }
    displayName = displayName ?? infos.find((f) => f.fields.name)?.fields.name;
  }

  const iniRel = "zomboid-server/zomboid-data/Server/servertest.ini";
  const remote = await agentReadServerFile(serverId, iniRel);
  const updated = addZomboidWorkshopModContent(remote.exists ? remote.content ?? "" : "", workshopId, modIds);
  await agentWriteServerFile(serverId, iniRel, updated, { backup: true });
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "workshop", packageId: workshopId } },
    update: { name: displayName || `Workshop ${workshopId}`, workshopModId: modIds.join(";"), ...(version ? { version } : {}) },
    create: {
      serverId, provider: "workshop", packageId: workshopId,
      version: version || "Workshop", name: displayName || `Workshop ${workshopId}`, workshopModId: modIds.join(";"),
    },
  });
}

// ─── Valheim / V Rising (Thunderstore over BepInEx) ─────────────────────────

const VALHEIM_BEPINEX_URL = "https://github.com/BepInEx/BepInEx/releases/download/v5.4.22/BepInEx_x64_5.4.22.0.zip";
export const VALHEIM_CORE_ROW_ID = "denikson-BepInExPack_Valheim";

async function bepinexCorePresent(serverId: string, subDir: string): Promise<boolean> {
  const entries = await agentListServerDir(serverId, subDir).catch(() => []);
  return entries.some((e) => e.name === "doorstop_config.ini");
}

/**
 * Shared remote Thunderstore installer for the BepInEx pair: resolve the
 * package + dependency graph from the community index, stage the core pack
 * (when missing) and every content package into a data-dir-shaped tree, ship
 * it in one go, then record rows.
 */
async function installBepInExThunderstoreRemote(args: {
  serverId: string;
  game: "VALHEIM" | "VRISING";
  packageId: string;
  name?: string;
  versionNumber?: string;
  downloadUrl?: string;
  warnings: string[];
}): Promise<RemoteInstallResult> {
  const { serverId, game, packageId, name, versionNumber, downloadUrl, warnings } = args;
  const subDir = game === "VALHEIM" ? "valheim-server" : "vrising-server";
  const community = communityForGame(game)!;

  const index = await fetchCommunityIndex(community);
  const pkg = index.find((p) => p.full_name === packageId);
  if (!pkg) throw new Error(`Package '${packageId}' not found on Thunderstore.`);
  if (pkg.is_deprecated) warnings.push(`'${pkg.name}' is deprecated on Thunderstore — consider an alternative.`);

  const requested = findVersionEntry(pkg, { versionNumber, downloadUrl });
  const versionEntry = requested ?? newestVersion(pkg);
  if (!versionEntry) throw new Error(`Package '${packageId}' has no published versions.`);
  if (!requested) {
    warnings.push(`Could not match the requested version of ${pkg.name} — installing ${versionEntry.version_number} (latest).`);
  }

  const staging = await makeModStagingRoot(serverId);
  try {
    const serverStage = mkdirp(path.join(staging, subDir));
    const needCore =
      isBepInExCore(packageId) ||
      !(await bepinexCorePresent(serverId, subDir)); // BepInEx core is a hard prerequisite for plugins.

    if (needCore) {
      const tempZip = path.join(staging, ".core.zip");
      if (game === "VALHEIM") {
        await downloadFile(VALHEIM_BEPINEX_URL, tempZip);
        new AdmZip(tempZip).extractAllTo(serverStage, true);
      } else {
        const corePkg = index.find((p) => p.full_name === "BepInEx-BepInExPack_V_Rising");
        const coreVersion = corePkg ? newestVersion(corePkg) : null;
        if (!corePkg || !coreVersion) {
          throw new Error("BepInExPack_V_Rising is no longer available on Thunderstore — it is required for V Rising plugins.");
        }
        await downloadFile(coreVersion.download_url, tempZip);
        extractCorePack(new AdmZip(tempZip), serverStage);
      }
      fs.unlinkSync(tempZip);
    }

    const pluginsStage = mkdirp(path.join(serverStage, "BepInEx", "plugins"));
    const stagedPackages: { packageId: string; name: string; version: string; url: string }[] = [];

    if (!isBepInExCore(packageId)) {
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
        warnings.push(`Dependency ${depString} could not be resolved — the mod may not work without it.`);
      }
      stagedPackages.push(
        ...depOrder.map((d) => ({ packageId: d.packageId, name: d.name, version: d.version, url: d.downloadUrl })),
        { packageId, name: name || pkg.name, version: versionEntry.version_number, url: versionEntry.download_url }
      );
    } else {
      stagedPackages.push({ packageId, name: name || pkg.name, version: versionEntry.version_number, url: versionEntry.download_url });
    }

    for (const p of stagedPackages) {
      if (isBepInExCore(p.packageId)) continue; // core already staged above
      const tempZip = path.join(pluginsStage, `.${p.packageId}.zip`);
      await downloadFile(p.url, tempZip);
      try {
        extractThunderstorePackage(new AdmZip(tempZip), safeJoin(pluginsStage, p.packageId));
      } finally {
        fs.unlinkSync(tempZip);
      }
    }

    await ship(serverId, staging, {
      deletes: stagedPackages.filter((p) => !isBepInExCore(p.packageId)).map((p) => `${subDir}/BepInEx/plugins/${p.packageId}`),
      backupPaths: [`${subDir}/BepInEx`, `${subDir}/doorstop_config.ini`, `${subDir}/winhttp.dll`],
    });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  // Rows only after the ship landed.
  if (isBepInExCore(packageId)) {
    await prisma.modInstallation.upsert({
      where: { serverId_provider_packageId: { serverId, provider: "thunderstore", packageId } },
      update: { version: versionEntry.version_number, name: name || pkg.name },
      create: { serverId, provider: "thunderstore", packageId, version: versionEntry.version_number, name: name || pkg.name },
    });
    return { dependencyCount: 0 };
  }
  const installedIds = new Set(
    (await prisma.modInstallation.findMany({ where: { serverId }, select: { packageId: true } }))
      .map((m) => m.packageId)
  );
  const { order: depOrder2 } = collectDependencies(
    { packageId, version: versionEntry },
    (id) => index.find((p) => p.full_name === id) ?? null,
    (id) => installedIds.has(id)
  );
  for (const dep of depOrder2) {
    await prisma.modInstallation.upsert({
      where: { serverId_provider_packageId: { serverId, provider: "thunderstore", packageId: dep.packageId } },
      update: { version: dep.version, name: dep.name },
      create: { serverId, provider: "thunderstore", packageId: dep.packageId, version: dep.version, name: dep.name },
    });
  }
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "thunderstore", packageId } },
    update: {
      version: versionEntry.version_number, name: name || pkg.name,
      dependencies: JSON.stringify(depOrder2.map((d) => d.packageId)),
    },
    create: {
      serverId, provider: "thunderstore", packageId,
      version: versionEntry.version_number, name: name || pkg.name,
      dependencies: JSON.stringify(depOrder2.map((d) => d.packageId)),
    },
  });
  return { dependencyCount: depOrder2.length };
}

export const installValheimThunderstoreRemote = (args: Omit<Parameters<typeof installBepInExThunderstoreRemote>[0], "game">) =>
  installBepInExThunderstoreRemote({ ...args, game: "VALHEIM" });
export const installVRisingThunderstoreRemote = (args: Omit<Parameters<typeof installBepInExThunderstoreRemote>[0], "game">) =>
  installBepInExThunderstoreRemote({ ...args, game: "VRISING" });

// ─── Updates (remote mirror of updateApply.resolveModUpdate) ───────────────

export interface ResolvedRemoteUpdate {
  newVersionNumber: string;
  applyUpdate: () => Promise<void>;
  rowPatch?: { workshopModId?: string };
  /** Reserved for parity with the local resolver; remote updates set it never. */
  warnings?: string[];
}

/**
 * Resolve the newest version of an installed mod on an AGENT server and
 * build the remote file-swap closure. Same resolution rules as
 * updateApply.resolveModUpdate; providers whose apply is a local fs dance we
 * can't mirror yet (ficsit, palworld, workshop) refuse with the same
 * client-facing status.
 */
export async function resolveRemoteModUpdate(
  installation: { provider: string; packageId: string; version: string; name?: string; workshopModId?: string | null },
  game: string,
  serverId: string
): Promise<ResolvedRemoteUpdate> {
  const marker = await readRemoteLoaderMarker(serverId);

  if (installation.provider === "modrinth" || installation.provider === "curseforge") {
    if (game !== "MINECRAFT") {
      throw new UpdateResolutionError(`${installation.provider === "modrinth" ? "Modrinth" : "CurseForge"} mod updates are supported for Minecraft servers only.`);
    }
    const gameVersion = await detectRemoteMinecraftVersion(serverId);
    const loader = marker?.type ?? null;
    const jarRel = `mods/${installation.packageId}.jar`;

    if (installation.provider === "modrinth") {
      const candidate = await resolveInstallCandidate(installation.packageId, { gameVersion, loader });
      return {
        newVersionNumber: candidate.version.version_number,
        applyUpdate: async () => {
          await shipSingleJar(serverId, jarRel, candidate.file.url);
        },
      };
    }
    const modId = Number(installation.packageId);
    if (!Number.isInteger(modId) || modId <= 0) {
      throw new UpdateResolutionError(`'${installation.packageId}' is not a CurseForge mod id.`, 404);
    }
    const files = await getCurseForgeModFiles(modId);
    const candidate = pickCompatibleCfFile(files, { mcVersion: gameVersion, loader });
    if (!candidate) {
      throw new UpdateResolutionError(`No compatible CurseForge file found for '${installation.name ?? installation.packageId}'.`, 404);
    }
    return {
      newVersionNumber: candidate.displayName,
      applyUpdate: async () => {
        await shipSingleJar(serverId, jarRel, curseForgeDownloadUrl(candidate));
      },
    };
  }

  if (installation.provider === "umod") {
    if (game !== "RUST") {
      throw new UpdateResolutionError("uMod plugin updates are supported for Rust servers only.");
    }
    const meta = await fetchUmodPluginMeta(installation.packageId);
    if (!meta?.latest_release_version) {
      throw new UpdateResolutionError(`Plugin '${installation.packageId}' has no releases on uMod.`, 404);
    }
    return {
      newVersionNumber: meta.latest_release_version,
      applyUpdate: async () => {
        await installRustUmodPluginRemote({
          serverId,
          packageId: installation.packageId,
          name: installation.name,
          version: meta.latest_release_version,
          downloadUrl: meta.download_url,
          warnings: [],
        });
      },
    };
  }

  if (installation.provider === "thunderstore") {
    if (game !== "VALHEIM" && game !== "VRISING") {
      throw new UpdateResolutionError("Thunderstore mod updates are supported for Valheim and V Rising servers only.");
    }
    const subDir = game === "VALHEIM" ? "valheim-server" : "vrising-server";
    const index = await fetchCommunityIndex(communityForGame(game)!);
    const pkg = index.find((p) => p.full_name === installation.packageId);
    const latest = pkg ? newestVersion(pkg) : null;
    if (!pkg || !latest) {
      throw new UpdateResolutionError(`Package '${installation.packageId}' not found on Thunderstore.`, 404);
    }
    return {
      newVersionNumber: latest.version_number,
      applyUpdate: async () => {
        const staging = await makeModStagingRoot(serverId);
        try {
          const dest = mkdirp(path.join(staging, subDir, "BepInEx", "plugins", installation.packageId));
          const tempZip = path.join(staging, ".pkg.zip");
          await downloadFile(latest.download_url, tempZip);
          try {
            extractThunderstorePackage(new AdmZip(tempZip), dest);
          } finally {
            fs.unlinkSync(tempZip);
          }
          await ship(serverId, staging, {
            deletes: [`${subDir}/BepInEx/plugins/${installation.packageId}`],
            backupPaths: [`${subDir}/BepInEx/plugins`],
          });
        } finally {
          fs.rmSync(staging, { recursive: true, force: true });
        }
      },
    };
  }

  if (installation.provider === "workshop" && game === "ARK") {
    throw new UpdateResolutionError("ARK workshop mods update automatically at server start (-automanagemods) — restart the server instead.");
  }
  if (installation.provider === "workshop" && game === "ZOMBOID") {
    throw new UpdateResolutionError("Zomboid workshop updates on nodes aren't supported yet — uninstall and reinstall the mod.");
  }

  throw new UpdateResolutionError("Mod updates aren't supported for this provider on remote-node servers yet.");
}

async function shipSingleJar(serverId: string, jarRel: string, url: string): Promise<void> {
  const staging = await makeModStagingRoot(serverId);
  try {
    await downloadFile(url, path.join(staging, jarRel));
    await ship(serverId, staging, { deletes: [jarRel], backupPaths: ["mods"] });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// ─── Rust (uMod/Oxide) ──────────────────────────────────────────────────────

async function oxideCorePresentRemote(serverId: string): Promise<boolean> {
  const entries = await agentListServerDir(serverId, "rust-server/RustDedicated_Data/Managed").catch(() => []);
  return entries.some((e) => e.name === "Oxide.Core.dll");
}

export async function installOxideCoreRemote(args: { serverId: string }): Promise<void> {
  const { serverId } = args;
  if (await oxideCorePresentRemote(serverId)) return; // idempotent via the marker, like the local flow
  const staging = await makeModStagingRoot(serverId);
  try {
    const rustStage = mkdirp(path.join(staging, "rust-server"));
    const tempZip = path.join(staging, ".oxide-core.zip");
    await downloadFile(OXIDE_CORE_DOWNLOAD_URL, tempZip);
    try {
      // Per-entry re-anchored extraction (traversal-safe), rooted at
      // RustDedicated_Data/ — umod.ts parity, no wrapper strip.
      extractThunderstorePackage(new AdmZip(tempZip), rustStage);
    } finally {
      fs.unlinkSync(tempZip);
    }
    mkdirp(path.join(staging, "rust-server", "Oxide", "plugins"));
    await ship(serverId, staging, {
      backupPaths: ["rust-server/RustDedicated_Data/Managed", "rust-server/Oxide"],
    });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "umod", packageId: OXIDE_CORE_PACKAGE_ID } },
    update: { version: "release" },
    create: {
      serverId, provider: "umod", packageId: OXIDE_CORE_PACKAGE_ID,
      version: "release", name: "Oxide/uMod framework",
    },
  });
}

export async function installRustUmodPluginRemote(args: {
  serverId: string;
  packageId: string;
  name?: string;
  version?: string;
  downloadUrl?: string;
  warnings: string[];
}): Promise<void> {
  const { serverId, packageId, name, version, downloadUrl } = args;
  // uMod serves only the newest release — without a pinned URL the metadata
  // endpoint resolves it (same honesty as the local flow).
  let url = downloadUrl ?? "";
  let resolvedVersion = version ?? "";
  if (!url) {
    const meta = await fetchUmodPluginMeta(packageId);
    if (!meta?.download_url) {
      throw new Error(`Couldn't resolve '${packageId}' on umod.org (rate-limited or gone) — try again shortly.`);
    }
    url = meta.download_url;
    resolvedVersion = version ?? meta.latest_release_version ?? "latest";
  }
  if (!(await oxideCorePresentRemote(serverId))) {
    await installOxideCoreRemote({ serverId });
  }

  const staging = await makeModStagingRoot(serverId);
  try {
    const dest = mkdirp(path.join(staging, "rust-server", "Oxide", "plugins"));
    await downloadFile(url, path.join(dest, `${packageId}.cs`));
    await ship(serverId, staging, {
      deletes: [`rust-server/Oxide/plugins/${packageId}.cs`],
      backupPaths: ["rust-server/Oxide/plugins"],
    });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "umod", packageId } },
    update: { version: resolvedVersion || "latest", ...(name ? { name } : {}) },
    create: {
      serverId, provider: "umod", packageId,
      version: resolvedVersion || "latest", name: name || packageId,
    },
  });
}
