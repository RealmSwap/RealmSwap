import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import AdmZip from "adm-zip";
import { downloadFile } from "../download";
import { ensureJava } from "../runtimes/javaRuntime";
import { dataRoot as defaultDataRoot } from "../appPaths";

/**
 * Minecraft mod-loader support.
 *
 * A vanilla `server.jar` never reads the `mods/` directory — without a loader
 * installed, every jar dropped there is a silent no-op (the server boots fine,
 * the mod simply never loads). This module detects what a server/jar actually
 * needs, installs a server loader, and records a marker file the runner
 * consults at launch.
 *
 * - Fabric: download `fabric-server-launch.jar` from the official meta API; the
 *   vanilla `server.jar` is swapped for it at launch.
 * - Quilt: run the official installer headlessly; it leaves
 *   `quilt-server-launch.jar`, which swaps in the same way.
 * - Forge / NeoForge: download the official installer jar and run it headless
 *   (`--installServer`). Modern (1.17+) installs must launch through the args
 *   file the installer writes (`@libraries/.../win_args.txt`), legacy Forge
 *   (≤1.16) produces a `-universal.jar` that replaces `server.jar` like Fabric.
 *
 * All installers are dependency-injected (`InstallerDeps`) so the flows are
 * unit-testable without network, a Java runtime, or a Windows host.
 */

export type LoaderType = "fabric" | "quilt" | "forge" | "neoforge";

/** How the runner must launch the server once this loader is installed. */
export type LoaderLaunch =
  | { kind: "jar"; file: string } // replaces `server.jar` in the -jar launch (Fabric, legacy Forge)
  | { kind: "argsFile"; file: string }; // replaces `-jar server.jar` with `@<file>` (modern Forge/NeoForge)

export interface LoaderMarker {
  type: LoaderType;
  loaderVersion: string;
  minecraftVersion: string;
  installedAt: string;
  launch?: LoaderLaunch;
}

const MARKER_FILE = "realmswap-loader.json";
export const FABRIC_META = "https://meta.fabricmc.net/v2";
export const QUILT_META = "https://meta.quiltmc.org/v3";
export const FORGE_PROMOTIONS = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
export const FORGE_MAVEN = "https://maven.minecraftforge.net";
export const NEOFORGE_MAVEN = "https://maven.neoforged.net";

export function loaderMarkerPath(installDir: string): string {
  return path.join(installDir, MARKER_FILE);
}

export function readLoaderMarker(installDir: string): LoaderMarker | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(loaderMarkerPath(installDir), "utf-8"));
    if (parsed && typeof parsed.type === "string") {
      // Markers written before the `launch` field existed always meant
      // "swap in fabric-server-launch.jar".
      if (!parsed.launch && parsed.type === "fabric") {
        parsed.launch = { kind: "jar", file: "fabric-server-launch.jar" };
      }
      return parsed as LoaderMarker;
    }
  } catch {
    // absent or corrupt — treat as no loader
  }
  return null;
}

export function writeLoaderMarker(installDir: string, marker: LoaderMarker): void {
  fs.writeFileSync(loaderMarkerPath(installDir), JSON.stringify(marker, null, 2));
}

/** The Minecraft version of an installed server, read from version.json inside server.jar. */
export function detectMinecraftVersion(installDir: string): string | null {
  try {
    const jar = path.join(installDir, "server.jar");
    if (!fs.existsSync(jar)) return null;
    const zip = new AdmZip(jar);
    const entry = zip.getEntry("version.json");
    if (!entry) return null;
    const parsed = JSON.parse(zip.readAsText(entry));
    return parsed?.id || parsed?.name || null;
  } catch {
    return null;
  }
}

/**
 * Which loader a mod jar targets, read from its manifest:
 * fabric.mod.json (Fabric), quilt.mod.json (Quilt), META-INF/neoforge.mods.toml
 * (NeoForge), META-INF/mods.toml (Forge/NeoForge-legacy).
 */
export function detectModLoader(jarPath: string): LoaderType | null {
  try {
    const zip = new AdmZip(jarPath);
    if (zip.getEntry("fabric.mod.json")) return "fabric";
    if (zip.getEntry("quilt.mod.json")) return "quilt";
    if (zip.getEntry("META-INF/neoforge.mods.toml")) return "neoforge";
    if (zip.getEntry("META-INF/mods.toml")) return "forge";
    return null;
  } catch {
    return null;
  }
}

/**
 * Rewrite a vanilla Minecraft launch command line for an installed loader.
 * Pure over the given args/marker/existence check so the runner stays thin:
 * - `jar` launch: `server.jar` → the loader's jar.
 * - `argsFile` launch: `-jar server.jar` → `@<args file>` (everything else —
 *   memory flags, `nogui` — is preserved).
 * Returns the args unchanged when no marker, no `server.jar` argument, or a
 * missing launch artifact makes the vanilla launch the honest fallback.
 */
export function applyLoaderLaunch(
  args: string[],
  marker: LoaderMarker | null,
  exists: (relFile: string) => boolean
): string[] {
  if (!marker?.launch) return args;
  const idx = args.indexOf("server.jar");
  if (idx === -1) return args;
  if (!exists(marker.launch.file)) return args;

  if (marker.launch.kind === "jar") {
    const next = [...args];
    next[idx] = marker.launch.file;
    return next;
  }
  const next = [...args];
  if (idx > 0 && next[idx - 1] === "-jar") {
    next.splice(idx - 1, 2, `@${marker.launch.file}`);
  } else {
    next[idx] = `@${marker.launch.file}`;
  }
  return next;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json();
}

// ─── Pure version-resolution helpers ────────────────────────────────────────

/**
 * The Java major version a Minecraft version needs (also the version used to
 * run installer jars, which are compiled for their era's JDK).
 */
export function javaMajorForMinecraft(mcVersion: string): number {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(mcVersion.trim());
  if (!m) return 21;
  const minor = parseInt(m[2], 10);
  const patch = m[3] ? parseInt(m[3], 10) : 0;
  // Year-based releases (Minecraft 26.x, Mojang's 2026 scheme) run on the
  // Java LTS the built-in definition pins for them (25). The pre-2026 rule
  // below returned 21 for these, sending every modded 26.x boot test and
  // Start to a JDK that was never provisioned.
  if (m[1] !== "1") return 25;
  if (minor <= 16) return 8; // 1.16.5 and older
  if (minor <= 20 && !(minor === 20 && patch >= 5)) return 17; // 1.17 – 1.20.4
  return 21; // 1.20.5+
}

/**
 * The Java major a MINECRAFT server start should run on. A loader install
 * replaces the definition's pinned vanilla jar with the loader's Minecraft
 * release, so the definition's pinned Java (chosen for that vanilla build)
 * no longer applies — the loader marker's version wins. This keeps Start on
 * the same runtime the boot test verified (resolveSandboxJava makes the same
 * decision from the same marker).
 */
export function minecraftStartJavaMajor(args: {
  markerMinecraftVersion?: string | null;
  specMajor?: number | null;
}): number {
  if (args.markerMinecraftVersion) return javaMajorForMinecraft(args.markerMinecraftVersion);
  return args.specMajor ?? 25;
}

/** Preferred Forge build for a Minecraft version from the promotions map (recommended > latest). */
export function pickForgeVersion(
  promos: Record<string, string>,
  mcVersion: string
): string | null {
  return promos[`${mcVersion}-recommended`] ?? promos[`${mcVersion}-latest`] ?? null;
}

/** The maven artifact for a Forge build, e.g. "1.20.1-47.2.0" (or the double-suffixed 1.7.10 form). */
export function forgeArtifact(mcVersion: string, forgeVersion: string): string {
  return `${mcVersion}-${forgeVersion}`;
}

export function forgeInstallerUrl(mcVersion: string, forgeVersion: string): string {
  const artifact = forgeArtifact(mcVersion, forgeVersion);
  return `${FORGE_MAVEN}/net/minecraftforge/forge/${artifact}/forge-${artifact}-installer.jar`;
}

/**
 * The NeoForge version stream for a Minecraft version: "1.21.1" → "21.1",
 * "1.21" → "21.0" (NeoForge drops the leading "1." and uses .0 for x.0 MC).
 */
export function neoforgeStreamFor(mcVersion: string): string | null {
  const m = /^1\.(\d+)(?:\.(\d+))?$/.exec(mcVersion.trim());
  if (!m) return null;
  return m[2] ? `${m[1]}.${m[2]}` : `${m[1]}.0`;
}

/** Newest stable (non-prerelease) NeoForge build in `versions` for the given Minecraft version. */
export function pickNeoforgeVersion(versions: string[], mcVersion: string): string | null {
  const stream = neoforgeStreamFor(mcVersion);
  if (!stream) return null;
  const compare = (a: string, b: string) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
  const candidates = versions
    .filter((v) => v.startsWith(`${stream}.`) && !v.includes("-"))
    .sort(compare);
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

export function neoforgeInstallerUrl(neoforgeVersion: string): string {
  return `${NEOFORGE_MAVEN}/releases/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`;
}

// ─── Post-install launch discovery ──────────────────────────────────────────

export interface FindLaunchDeps {
  readdir?: (p: string) => string[];
  exists?: (p: string) => boolean;
}

/**
 * Locate what an installer actually produced and how to launch it:
 * modern Forge/NeoForge write `win_args.txt`/`unix_args.txt` under
 * `libraries/.../<artifact>/`, legacy Forge (≤1.16) leaves a
 * `forge-<mc>-<build>-universal.jar` at the server root.
 */
export function findLoaderLaunch(
  type: "forge" | "neoforge",
  installDir: string,
  deps: FindLaunchDeps = {}
): LoaderLaunch | null {
  const readdir = deps.readdir ?? ((p: string) => fs.readdirSync(p));
  const exists = deps.exists ?? ((p: string) => fs.existsSync(p));
  const argsName = process.platform === "win32" ? "win_args.txt" : "unix_args.txt";
  const librariesRoot =
    type === "neoforge"
      ? path.join(installDir, "libraries", "net", "neoforged", "neoforge")
      : path.join(installDir, "libraries", "net", "minecraftforge", "forge");

  try {
    for (const versionDir of readdir(librariesRoot)) {
      const rel = path.join(
        "libraries",
        type === "neoforge" ? path.join("net", "neoforged", "neoforge") : path.join("net", "minecraftforge", "forge"),
        versionDir,
        argsName
      );
      if (exists(path.join(installDir, rel))) return { kind: "argsFile", file: rel };
    }
  } catch {
    // no libraries tree — fall through to the legacy check
  }

  if (type === "forge") {
    try {
      const universal = readdir(installDir).find(
        (f) => f.startsWith("forge-") && f.endsWith("-universal.jar")
      );
      if (universal) return { kind: "jar", file: universal };
    } catch {
      // unreadable dir — nothing to find
    }
  }
  return null;
}

// ─── Installer flows ────────────────────────────────────────────────────────

export interface InstallerDeps {
  fetchJson?: (url: string) => Promise<any>;
  download?: (url: string, dest: string) => Promise<void>;
  ensureJava?: (major: number) => Promise<string>;
  runInstaller?: (javaExe: string, installerPath: string, installDir: string, opts: { modern: boolean }) => Promise<void>;
  /** Run `java <args>` in cwd — used by installers whose CLI isn't `--installServer` (Quilt). */
  runProcess?: (javaExe: string, args: string[], cwd: string) => Promise<void>;
  exists?: (p: string) => boolean;
}

const INSTALLER_TIMEOUT_MS = 10 * 60 * 1000;

function runJavaProcess(
  javaExe: string,
  args: string[],
  cwd: string,
  onLog: (msg: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(javaExe, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Loader installer timed out after 10 minutes."));
    }, INSTALLER_TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      output += d.toString();
      for (const line of d.toString().split("\n")) {
        if (line.trim()) onLog(`[installer] ${line.trimEnd()}`);
      }
    });
    child.stderr.on("data", (d) => {
      output += d.toString();
      for (const line of d.toString().split("\n")) {
        if (line.trim()) onLog(`[installer] ${line.trimEnd()}`);
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Could not run the loader installer (${err.message}). Installer jars need the bundled Java runtime — install loaders on the Windows host running the server.`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Loader installer exited with code ${code}: ${output.slice(-400)}`));
    });
  });
}

function defaultRunInstaller(
  javaExe: string,
  installerPath: string,
  installDir: string,
  modern: boolean,
  onLog: (msg: string) => void
): Promise<void> {
  // Modern Forge/NeoForge installers take the target dir; legacy Forge
  // (MC ≤1.16) treats --installServer as a bare flag and uses its cwd.
  const args = ["-jar", path.basename(installerPath), "--installServer"];
  if (modern) args.push(installDir);
  return runJavaProcess(javaExe, args, installDir, onLog);
}

/**
 * Run a Forge/NeoForge installer jar headlessly inside installDir and return
 * how the server must now be launched. `--installServer <dir>` for modern
 * installers; legacy Forge (MC ≤1.16) installs into its cwd and takes no dir.
 */
async function runLoaderInstaller(
  type: "forge" | "neoforge",
  installDir: string,
  installerUrl: string,
  installerName: string,
  minecraftVersion: string,
  onLog: (msg: string) => void,
  deps: InstallerDeps
): Promise<LoaderLaunch> {
  const download =
    deps.download ?? ((url: string, dest: string) => downloadFile(url, dest));
  const ensureJavaDep =
    deps.ensureJava ??
    ((major: number) => ensureJava(major, { dataRoot: defaultDataRoot(), onLog }));
  const runInstaller =
    deps.runInstaller ??
    ((javaExe: string, installerPath: string, dir: string, opts: { modern: boolean }) =>
      defaultRunInstaller(javaExe, installerPath, dir, opts.modern, onLog));

  const installerPath = path.join(installDir, installerName);
  onLog("Downloading loader installer…");
  await download(installerUrl, installerPath);

  const javaMajor = javaMajorForMinecraft(minecraftVersion);
  const modern = javaMajor > 8;
  const javaExe = await ensureJavaDep(javaMajor);
  onLog(`Running installer with Java ${javaMajor}${modern ? "" : " (legacy server)"}…`);
  try {
    await runInstaller(javaExe, installerPath, installDir, { modern });
  } finally {
    try {
      fs.unlinkSync(installerPath);
    } catch {
      // installer already cleaned up or never fully written — snapshot restore covers it
    }
  }

  const launch = findLoaderLaunch(type, installDir);
  if (!launch) {
    throw new Error(
      `The installer completed but produced no recognizable launch files (no ${type} args file or universal jar). Installation rolled back.`
    );
  }
  return launch;
}

/**
 * Install the Fabric server launcher for the given Minecraft version:
 * downloads `fabric-server-launch.jar` via the official Fabric meta API and
 * writes the loader marker. The vanilla server.jar is left in place — the
 * launcher downloads/provisions what it needs on first boot.
 */
export interface InstallFabricOpts {
  /** Pack-pinned Fabric loader build; when omitted the newest stable is used. */
  pinnedVersion?: string | null;
  onLog?: (msg: string) => void;
}

export async function installFabricServer(
  installDir: string,
  minecraftVersion: string,
  optsOrLog: InstallFabricOpts | ((msg: string) => void) = {},
  deps: InstallerDeps = {}
): Promise<LoaderMarker> {
  const opts: InstallFabricOpts = typeof optsOrLog === "function" ? { onLog: optsOrLog } : optsOrLog;
  const onLog = opts.onLog ?? (() => {});
  const fetchJsonDep = deps.fetchJson ?? fetchJson;
  const download = deps.download ?? ((url: string, dest: string) => downloadFile(url, dest));

  onLog(`Resolving Fabric loader for Minecraft ${minecraftVersion}…`);
  const loaders: any[] = await fetchJsonDep(`${FABRIC_META}/versions/loader/${encodeURIComponent(minecraftVersion)}`);
  // Packs pin the exact loader build they were authored against (the same
  // way forge/quilt/neoforge pins are honored) — latest-stable only when
  // nothing is pinned.
  let loaderVersion: string | undefined;
  if (opts.pinnedVersion) {
    if (!loaders.some((l) => l?.loader?.version === opts.pinnedVersion)) {
      throw new Error(`Fabric loader ${opts.pinnedVersion} is not available for Minecraft ${minecraftVersion}.`);
    }
    loaderVersion = opts.pinnedVersion;
  } else {
    const stable = loaders.find((l) => l?.loader?.stable) ?? loaders[0];
    loaderVersion = stable?.loader?.version;
  }
  if (!loaderVersion) throw new Error(`No Fabric loader available for Minecraft ${minecraftVersion}`);

  onLog("Resolving Fabric installer version…");
  const installers: any[] = await fetchJsonDep(`${FABRIC_META}/versions/installer`);
  const installerVersion: string | undefined = installers[0]?.version;
  if (!installerVersion) throw new Error("No Fabric installer version available");

  const jarUrl = `${FABRIC_META}/versions/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(loaderVersion)}/${encodeURIComponent(installerVersion)}/server/jar`;
  const dest = path.join(installDir, "fabric-server-launch.jar");
  onLog(`Downloading Fabric server launcher…`);
  await download(jarUrl, dest);

  const marker: LoaderMarker = {
    type: "fabric",
    loaderVersion,
    minecraftVersion,
    installedAt: new Date().toISOString(),
    launch: { kind: "jar", file: "fabric-server-launch.jar" },
  };
  writeLoaderMarker(installDir, marker);
  onLog(`Fabric ${loaderVersion} installed for Minecraft ${minecraftVersion}.`);
  return marker;
}

export interface InstallQuiltOpts {
  /** Pack/collection-pinned quilt-loader version; when omitted the newest is used. */
  pinnedVersion?: string;
  onLog?: (msg: string) => void;
}

/**
 * Install the Quilt server launcher for the given Minecraft version: the
 * official installer runs headlessly (`install server <mc> [<loader>]
 * --install-dir=<dir>`) and leaves `quilt-server-launch.jar`, which replaces
 * `server.jar` in the launch command exactly like Fabric's launcher. The
 * vanilla server.jar is left alone (no --download-server).
 */
export async function installQuiltServer(
  installDir: string,
  minecraftVersion: string,
  opts: InstallQuiltOpts = {},
  deps: InstallerDeps = {}
): Promise<LoaderMarker> {
  const onLog = opts.onLog ?? (() => {});
  const fetchJsonDep = deps.fetchJson ?? fetchJson;
  const download = deps.download ?? ((url: string, dest: string) => downloadFile(url, dest));
  const ensureJavaDep =
    deps.ensureJava ??
    ((major: number) => ensureJava(major, { dataRoot: defaultDataRoot(), onLog }));
  const runProcess =
    deps.runProcess ?? ((javaExe, args, cwd) => runJavaProcess(javaExe, args, cwd, onLog));
  const exists = deps.exists ?? ((p: string) => fs.existsSync(p));

  onLog(`Resolving Quilt loader for Minecraft ${minecraftVersion}…`);
  const loaders: any[] = await fetchJsonDep(`${QUILT_META}/versions/loader/${encodeURIComponent(minecraftVersion)}`);
  let loaderVersion: string | null = opts.pinnedVersion ?? loaders[0]?.loader?.version ?? null;
  if (!loaderVersion) throw new Error(`No Quilt loader available for Minecraft ${minecraftVersion}`);
  if (opts.pinnedVersion && !loaders.some((l) => l?.loader?.version === opts.pinnedVersion)) {
    throw new Error(`Quilt loader ${opts.pinnedVersion} is not available for Minecraft ${minecraftVersion}.`);
  }

  onLog("Resolving Quilt installer version…");
  const installers: any[] = await fetchJsonDep(`${QUILT_META}/versions/installer`);
  const installerVersion: string | undefined = installers[0]?.version;
  const installerUrl: string | undefined = installers[0]?.url;
  if (!installerVersion || !installerUrl) throw new Error("No Quilt installer version available");

  const installerName = `quilt-installer-${installerVersion}.jar`;
  const installerPath = path.join(installDir, installerName);
  onLog("Downloading Quilt installer…");
  await download(installerUrl, installerPath);

  // The installer itself needs a modern JVM even when the server it sets up
  // targets an old Minecraft version.
  const javaMajor = Math.max(javaMajorForMinecraft(minecraftVersion), 17);
  const javaExe = await ensureJavaDep(javaMajor);
  onLog(`Running Quilt installer with Java ${javaMajor}…`);
  try {
    await runProcess(
      javaExe,
      ["-jar", installerName, "install", "server", minecraftVersion, loaderVersion, `--install-dir=${installDir}`],
      installDir
    );
  } finally {
    try {
      fs.unlinkSync(installerPath);
    } catch {
      // installer already cleaned up or never fully written — snapshot restore covers it
    }
  }

  if (!exists(path.join(installDir, "quilt-server-launch.jar"))) {
    throw new Error(
      "The Quilt installer completed but produced no quilt-server-launch.jar. Installation rolled back."
    );
  }

  const marker: LoaderMarker = {
    type: "quilt",
    loaderVersion,
    minecraftVersion,
    installedAt: new Date().toISOString(),
    launch: { kind: "jar", file: "quilt-server-launch.jar" },
  };
  writeLoaderMarker(installDir, marker);
  onLog(`Quilt ${loaderVersion} installed for Minecraft ${minecraftVersion}.`);
  return marker;
}

export interface InstallForgeOpts {
  /** Pack-pinned Forge build; when omitted the recommended/latest promotion is used. */
  pinnedVersion?: string;
  onLog?: (msg: string) => void;
}

/** Install the Forge server loader for the given Minecraft version. */
export async function installForgeServer(
  installDir: string,
  minecraftVersion: string,
  opts: InstallForgeOpts = {},
  deps: InstallerDeps = {}
): Promise<LoaderMarker> {
  const onLog = opts.onLog ?? (() => {});
  const fetchJsonDep = deps.fetchJson ?? fetchJson;

  let forgeVersion = opts.pinnedVersion ?? null;
  if (!forgeVersion) {
    onLog(`Resolving recommended Forge build for Minecraft ${minecraftVersion}…`);
    const promotions = await fetchJsonDep(FORGE_PROMOTIONS);
    forgeVersion = pickForgeVersion(promotions?.promos ?? {}, minecraftVersion);
    if (!forgeVersion) {
      throw new Error(`No Forge build is available for Minecraft ${minecraftVersion}.`);
    }
  }

  const artifact = forgeArtifact(minecraftVersion, forgeVersion);
  const launch = await runLoaderInstaller(
    "forge",
    installDir,
    forgeInstallerUrl(minecraftVersion, forgeVersion),
    `forge-${artifact}-installer.jar`,
    minecraftVersion,
    onLog,
    deps
  );

  const marker: LoaderMarker = {
    type: "forge",
    loaderVersion: forgeVersion,
    minecraftVersion,
    installedAt: new Date().toISOString(),
    launch,
  };
  writeLoaderMarker(installDir, marker);
  onLog(`Forge ${forgeVersion} installed for Minecraft ${minecraftVersion}.`);
  return marker;
}

export interface InstallNeoForgeOpts {
  /** Pack-pinned NeoForge build; when omitted the newest stable build is used. */
  pinnedVersion?: string;
  onLog?: (msg: string) => void;
}

/** Install the NeoForge server loader for the given Minecraft version (1.20.2+). */
export async function installNeoForgeServer(
  installDir: string,
  minecraftVersion: string,
  opts: InstallNeoForgeOpts = {},
  deps: InstallerDeps = {}
): Promise<LoaderMarker> {
  const onLog = opts.onLog ?? (() => {});
  const fetchJsonDep = deps.fetchJson ?? fetchJson;

  let neoforgeVersion = opts.pinnedVersion ?? null;
  if (!neoforgeVersion) {
    onLog(`Resolving latest NeoForge build for Minecraft ${minecraftVersion}…`);
    const listing: any = await fetchJsonDep(`${NEOFORGE_MAVEN}/api/maven/versions/releases/net/neoforged/neoforge`);
    neoforgeVersion = pickNeoforgeVersion(listing?.versions ?? [], minecraftVersion);
    if (!neoforgeVersion) {
      throw new Error(
        `No NeoForge build is available for Minecraft ${minecraftVersion} (NeoForge supports 1.20.2 and newer).`
      );
    }
  }

  const launch = await runLoaderInstaller(
    "neoforge",
    installDir,
    neoforgeInstallerUrl(neoforgeVersion),
    `neoforge-${neoforgeVersion}-installer.jar`,
    minecraftVersion,
    onLog,
    deps
  );

  const marker: LoaderMarker = {
    type: "neoforge",
    loaderVersion: neoforgeVersion,
    minecraftVersion,
    installedAt: new Date().toISOString(),
    launch,
  };
  writeLoaderMarker(installDir, marker);
  onLog(`NeoForge ${neoforgeVersion} installed for Minecraft ${minecraftVersion}.`);
  return marker;
}
