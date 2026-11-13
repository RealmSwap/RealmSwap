import { execFile } from "child_process";
import { promisify } from "util";

/**
 * Windows-only runtime-library prerequisites for game dedicated servers
 * (VC++ 2015-2022 redistributable, .NET Framework 4.8+). Read-only registry
 * detection via `reg query` — never mutates the OS, never throws into the
 * deploy path: anything we can't determine reports "unknown".
 */

const execFileAsync = promisify(execFile);

/** Three-state detection: definitely present / definitely absent / can't tell. */
export type PrereqStatus = "installed" | "missing" | "unknown";

export type PrereqKind = "VC_REDIST_2015_2022_X64" | "DOTNET_FRAMEWORK_48";

export interface PrereqDeps {
  /** Command runner seam (tests). Defaults to `reg query` via execFile. */
  run?: (file: string, args: string[]) => Promise<{ stdout: string }>;
  /** Host platform override (tests). Defaults to process.platform. */
  platform?: string;
}

const VC_REDIST_REG_KEY = "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64";
const DOTNET_48_REG_KEY = "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full";
/** Release DWORD floor for .NET Framework 4.8 (Microsoft's release table). */
const DOTNET_48_MIN_RELEASE = 528040;

export const VC_REDIST_DOWNLOAD_URL = "https://aka.ms/vs/17/release/vc_redist.x64.exe";
export const DOTNET_DOWNLOAD_URL = "https://dotnet.microsoft.com/download/dotnet-framework/net48";

async function defaultRun(file: string, args: string[]): Promise<{ stdout: string }> {
  return execFileAsync(file, args, { timeout: 5000, windowsHide: true });
}

function isWindows(platform: string): boolean {
  return platform === "win32";
}

/** Pull a REG_DWORD value out of `reg query ... /v <name>` stdout. */
function regDword(stdout: string, valueName: string): number | null {
  const m = stdout.match(new RegExp(`${valueName}\\s+REG_DWORD\\s+0x([0-9a-fA-F]+)`));
  return m ? parseInt(m[1], 16) : null;
}

/**
 * Detect the VC++ 2015-2022 redistributable (x64) by its registry marker.
 *
 * Limitation (deliberately simple): we only read the native x64 registry view.
 * Every dedicated server we deploy is an x64 process, so the WOW6432Node
 * (32-bit) view is intentionally not consulted — a 32-bit-only redist install
 * will report "missing", which is the correct answer for an x64 server anyway.
 */
export async function detectVcRedist(deps: PrereqDeps = {}): Promise<PrereqStatus> {
  const platform = deps.platform ?? process.platform;
  if (!isWindows(platform)) return "unknown";
  const run = deps.run ?? defaultRun;
  try {
    const { stdout } = await run("reg", ["query", VC_REDIST_REG_KEY, "/v", "Installed"]);
    const installed = regDword(stdout, "Installed");
    if (installed === null) return "unknown";
    return installed === 1 ? "installed" : "missing";
  } catch {
    // reg.exe absent, key not found (redist never installed), or access
    // denied — can't tell, and a prereq check must never throw into deploy.
    return "unknown";
  }
}

/**
 * Detect .NET Framework 4.8+ via the NDP\v4\Full Release DWORD
 * (>= 528040 means 4.8 or any later 4.x release is installed).
 */
export async function detectDotNetFramework48(deps: PrereqDeps = {}): Promise<PrereqStatus> {
  const platform = deps.platform ?? process.platform;
  if (!isWindows(platform)) return "unknown";
  const run = deps.run ?? defaultRun;
  try {
    const { stdout } = await run("reg", ["query", DOTNET_48_REG_KEY, "/v", "Release"]);
    const release = regDword(stdout, "Release");
    if (release === null) return "unknown";
    return release >= DOTNET_48_MIN_RELEASE ? "installed" : "missing";
  } catch {
    return "unknown";
  }
}

/**
 * Per-game runtime-library requirements, keyed by game-definition slug.
 * Conservative by design — only games whose dedicated server is documented
 * (official docs / Steam depot dependency declarations) to need the library.
 * A false positive costs one advisory banner; a false negative is a server
 * that dies on start with a cryptic DLL error, which is what we're fixing.
 */
const GAME_PREREQS: Record<string, PrereqKind[]> = {
  // Valheim dedicated server (AppID 896660): Steam depot declares the VC++ 2015-2022 dependency.
  VALHEIM: ["VC_REDIST_2015_2022_X64"],
  // ARK dedicated server (AppID 376030): UE4 build, Steam depot lists the VC++ redistributable.
  ARK: ["VC_REDIST_2015_2022_X64"],
  // Enshrouded dedicated server (Keen's Windows x64 build): VC++ 2019/2022 redist per its host docs.
  ENSHROUDED: ["VC_REDIST_2015_2022_X64"],
  // Satisfactory dedicated server: official docs say Windows hosts must install VC++ 2015-2022 x64.
  SATISFACTORY: ["VC_REDIST_2015_2022_X64"],
  // Palworld dedicated server (AppID 2394010): UE5 build whose Steam depot declares VC++ (less certain than the four above).
  PALWORLD: ["VC_REDIST_2015_2022_X64"],
  // V Rising dedicated server (AppID 1829350): official server docs list VC++ 2015-2022 (moderate confidence).
  VRISING: ["VC_REDIST_2015_2022_X64"],
  // TerrariaServer.exe (AppID 282440) is a .NET Framework app; tModLoader needs .NET 4.8 too.
  // Moderate confidence in the 4.8 floor — modern Windows ships it, this guards stripped server hosts.
  TERRARIA: ["DOTNET_FRAMEWORK_48"],
  // MINECRAFT: Java only (auto-provisioned in runtimes/javaRuntime.ts). RUST: self-contained.
  // ZOMBOID: bundles its own JRE in the depot. WINDROSE: no documented requirement.
};

export function requiredPrereqs(gameSlug: string): PrereqKind[] {
  return GAME_PREREQS[gameSlug] ?? [];
}

const PREREQ_LABELS: Record<PrereqKind, string> = {
  VC_REDIST_2015_2022_X64: "Microsoft VC++ 2015-2022 redistributable (x64)",
  DOTNET_FRAMEWORK_48: "Microsoft .NET Framework 4.8 runtime (or newer)",
};

const PREREQ_LINKS: Record<PrereqKind, string> = {
  VC_REDIST_2015_2022_X64: VC_REDIST_DOWNLOAD_URL,
  DOTNET_FRAMEWORK_48: DOTNET_DOWNLOAD_URL,
};

function prereqWarning(kind: PrereqKind): string {
  return (
    `This game usually needs the ${PREREQ_LABELS[kind]}, which we couldn't detect on this machine — ` +
    `if the server fails to start, install it from ${PREREQ_LINKS[kind]} and try again.`
  );
}

/**
 * Non-blocking deploy warnings for a game's runtime-library prerequisites on
 * this host. Returns human-readable messages for every required library that
 * is not definitely installed (missing OR undetectable). Empty = all clear or
 * nothing required. Used by the deploy preflight; never throws.
 */
export async function collectPrereqWarnings(
  gameSlug: string,
  deps: PrereqDeps = {}
): Promise<string[]> {
  const needed = requiredPrereqs(gameSlug);
  if (needed.length === 0) return [];
  const warnings: string[] = [];
  for (const kind of needed) {
    const status =
      kind === "VC_REDIST_2015_2022_X64"
        ? await detectVcRedist(deps)
        : await detectDotNetFramework48(deps);
    if (status !== "installed") warnings.push(prereqWarning(kind));
  }
  return warnings;
}
