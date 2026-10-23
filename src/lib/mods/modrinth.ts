/**
 * Modrinth API helpers: version resolution against the installed server's
 * game version and loader, required-dependency graph walk, and the
 * client/server compatibility gate.
 */

export interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  dependencies: { project_id: string; dependency_type: "required" | "optional" | "embedded" | "incompatible" }[];
  files: ModrinthVersionFile[];
}

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  server_side: "required" | "optional" | "unsupported";
  client_side: "required" | "optional" | "unsupported";
}

const API = "https://api.modrinth.com/v2";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": "RealmSwap/0.5 (github.com/RealmSwap/RealmSwap)" } });
  if (!res.ok) throw new Error(`Modrinth request failed (${res.status}): ${url}`);
  return res.json() as Promise<T>;
}

export function fetchProject(idOrSlug: string): Promise<ModrinthProject> {
  return getJson(`${API}/project/${encodeURIComponent(idOrSlug)}`);
}

export async function fetchVersions(idOrSlug: string): Promise<ModrinthVersion[]> {
  return getJson(`${API}/project/${encodeURIComponent(idOrSlug)}/version`);
}

/** Pick the newest version compatible with the server's game version and loader (null matchers accept anything). */
export function pickCompatibleVersion(
  versions: ModrinthVersion[],
  opts: { gameVersion?: string | null; loader?: string | null; versionNumber?: string | null } = {}
): ModrinthVersion | null {
  // An exact pinned version wins outright — it was exported from a working
  // server, so it is trusted over the compatibility guesswork below.
  if (opts.versionNumber) {
    const pinned = versions.find((v) => v.version_number === opts.versionNumber);
    if (pinned) return pinned;
  }
  for (const v of versions) {
    if (opts.gameVersion && v.game_versions.length > 0 && !v.game_versions.includes(opts.gameVersion)) continue;
    if (opts.loader && v.loaders.length > 0 && !v.loaders.includes(opts.loader)) continue;
    return v; // Modrinth returns newest-first
  }
  return null;
}

export function primaryFile(version: ModrinthVersion): ModrinthVersionFile | null {
  return version.files.find((f) => f.primary) ?? version.files[0] ?? null;
}

/**
 * Walk the REQUIRED dependency graph from a root version and return the
 * versions that still need installing, in dependency-first order. The lookup
 * and alreadyInstalled predicates are injected so the walk is unit-testable
 * without network. Depth-capped and cycle-safe.
 */
export function collectRequiredDependencies(
  root: ModrinthVersion,
  lookup: (projectId: string) => ModrinthVersion | null,
  alreadyInstalled: (projectId: string) => boolean
): { order: ModrinthVersion[]; missingProjects: string[] } {
  const order: ModrinthVersion[] = [];
  const seen = new Set<string>([root.project_id]);
  const missingProjects: string[] = [];
  let queue: ModrinthVersion[] = [root];
  let depth = 0;
  const MAX_DEPTH = 12;

  while (queue.length > 0 && depth < MAX_DEPTH) {
    const next: ModrinthVersion[] = [];
    for (const version of queue) {
      for (const dep of version.dependencies) {
        if (dep.dependency_type !== "required") continue; // optional/embedded ride along or are bundled
        if (seen.has(dep.project_id)) continue;
        seen.add(dep.project_id);
        if (alreadyInstalled(dep.project_id)) continue;
        const depVersion = lookup(dep.project_id);
        if (!depVersion) {
          missingProjects.push(dep.project_id);
          continue;
        }
        if (!primaryFile(depVersion)) {
          missingProjects.push(dep.project_id);
          continue;
        }
        order.push(depVersion);
        next.push(depVersion);
      }
    }
    queue = next;
    depth++;
  }
  return { order, missingProjects };
}

/** Fetch latest versions and resolve a project to the best install candidate. */
export async function resolveInstallCandidate(
  idOrSlug: string,
  opts: { gameVersion?: string | null; loader?: string | null; versionNumber?: string | null } = {}
): Promise<{ project: ModrinthProject; version: ModrinthVersion; file: ModrinthVersionFile }> {
  const [project, versions] = await Promise.all([fetchProject(idOrSlug), fetchVersions(idOrSlug)]);
  const version = pickCompatibleVersion(versions, opts);
  if (!version) {
    throw new Error(
      `No version of ${project.title} matches${opts.versionNumber ? ` ${opts.versionNumber}` : ""}${opts.gameVersion ? ` (Minecraft ${opts.gameVersion})` : ""}${opts.loader ? ` (${opts.loader})` : ""}.`
    );
  }
  const file = primaryFile(version);
  if (!file) throw new Error(`No downloadable file for ${project.title} ${version.version_number}.`);
  return { project, version, file };
}
