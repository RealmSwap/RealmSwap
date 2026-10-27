import type { LoaderType } from "@/lib/mods/mcLoaders";
import type AdmZip from "adm-zip";

/**
 * CurseForge (CFCore) API helpers: search, install-candidate resolution
 * against the server's Minecraft version and loader, required-dependency
 * walk, and pack-file resolution for CurseForge modpack manifests.
 *
 * Two platform quirks shape this module:
 *
 * 1. The API key is formatted like a bcrypt hash (`$2a$10$...`). Env files
 *    are loaded through dotenv-expand, which eats unescaped `$word` segments
 *    — the key must be stored backslash-escaped (`\$2a\$10\$...`) and is
 *    normalized here so either form works.
 *
 * 2. Game access is gated per key: a fresh key sees Minecraft and a handful
 *    of other games; everything else returns 403 until Overwolf grants
 *    extended access. Only map games the key can actually serve — unmapped
 *    games fall through to the honest "not supported" state instead of
 *    failing requests.
 */

export interface CurseForgeMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  /** Top-level CF section (6 = mods, 4471 = modpacks); absent on some responses. */
  classId?: number;
  dateModified?: string;
  authors?: { name: string }[];
  categories?: { id: number; name: string; slug?: string }[];
  links?: { websiteUrl?: string };
  logo?: { thumbnailUrl?: string; url?: string };
  latestFiles?: { displayName?: string; fileName?: string }[];
  latestFilesIndexes?: { gameVersion: string; fileId: number; modLoader: number; filename: string }[];
}

/** algo 1 = sha1, algo 2 = md5 */
export interface CurseForgeHash {
  value: string;
  algo: number;
}

/** relationType 3 = required dependency; the reference is a fileId */
export interface CurseForgeFileDependency {
  fileId: number;
  relationType: number;
}

export interface CurseForgeFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  downloadUrl: string | null;
  hashes: CurseForgeHash[];
  gameVersions: string[];
  /** 0 Any, 1 Forge, 4 Fabric, 5 Quilt, 6 NeoForge (absent = Any) */
  modLoaderType?: number;
  dependencies: CurseForgeFileDependency[];
  /** false = the author disabled third-party distribution */
  isAvailable: boolean;
  /** alternates are dev/library artifacts, never install targets */
  isAlternate?: boolean;
  /** File size in bytes as reported by the API, when present. */
  fileLength?: number;
  fileDate?: string;
}

export interface CurseForgeDeps {
  fetchImpl?: typeof fetch;
  apiKey?: string | null;
}

const API = "https://api.curseforge.com/v1";

/** Game ids verified live against /v1/games for this key (2026-10-24). */
export const CURSEFORGE_GAME_IDS: Record<string, number> = {
  MINECRAFT: 432,
  PALWORLD: 85196,
  TERRARIA: 431,
};

/** CFCore loader enum. */
export const CURSEFORGE_LOADER_IDS = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 } as const;

/** CFCore class ids (top-level section filters for /mods/search). */
export const CURSEFORGE_CLASS_IDS = { mods: 6, modpacks: 4471 } as const;

/** CFCore sort-field enum (subset we expose). */
export const CURSEFORGE_SORT_FIELDS = { featured: 1, popularity: 2, lastUpdated: 3, name: 4, totalDownloads: 6 } as const;

export const REQUIRED_DEPENDENCY = 3;

/** Read the configured key, normalizing backslash-escaped dollars from .env. */
export function curseForgeApiKey(): string {
  return (process.env.CURSEFORGE_API_KEY ?? "").replace(/\\\$/g, "$").trim();
}

async function cfRequest<T>(path: string, init: RequestInit | undefined, deps?: CurseForgeDeps): Promise<T> {
  const apiKey = deps?.apiKey !== undefined ? deps.apiKey : curseForgeApiKey();
  if (!apiKey) {
    throw new Error("CURSEFORGE_API_KEY is not configured — CurseForge mods are unavailable.");
  }
  const doFetch = deps?.fetchImpl ?? fetch;
  const res = await doFetch(`${API}${path}`, {
    ...init,
    headers: { "x-api-key": apiKey, Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const hint = res.status === 403 ? " — this API key lacks access to that game (CurseForge gates games per key)" : "";
    throw new Error(`CurseForge request failed (${res.status}): ${path}${hint}`);
  }
  return res.json() as Promise<T>;
}

export async function searchCurseForgeMods(
  opts: {
    gameId: number;
    query?: string;
    offset?: number;
    pageSize?: number;
    sortField?: number;
    sortOrder?: string;
    categoryId?: number;
    classId?: number;
  },
  deps?: CurseForgeDeps
): Promise<{ data: CurseForgeMod[]; total: number }> {
  const params = new URLSearchParams({
    gameId: String(opts.gameId),
    sortField: String(opts.sortField ?? CURSEFORGE_SORT_FIELDS.popularity),
    sortOrder: opts.sortOrder ?? "desc",
  });
  if (opts.query?.trim()) params.set("searchFilter", opts.query.trim());
  if (opts.offset) params.set("index", String(opts.offset));
  params.set("pageSize", String(opts.pageSize ?? 20));
  if (opts.categoryId) params.set("categoryId", String(opts.categoryId));
  if (opts.classId) params.set("classId", String(opts.classId));
  const json = await cfRequest<{ data: CurseForgeMod[]; pagination: { total?: number } }>(
    `/mods/search?${params.toString()}`,
    undefined,
    deps
  );
  return { data: json.data ?? [], total: json.pagination?.total ?? json.data?.length ?? 0 };
}

export async function getCurseForgeMod(modId: number, deps?: CurseForgeDeps): Promise<CurseForgeMod> {
  const json = await cfRequest<{ data: CurseForgeMod }>(`/mods/${modId}`, undefined, deps);
  return json.data;
}

/** Newest-first (the API returns date-descending; file ids are monotonic). */
export async function getCurseForgeModFiles(modId: number, deps?: CurseForgeDeps): Promise<CurseForgeFile[]> {
  const json = await cfRequest<{ data: CurseForgeFile[] }>(`/mods/${modId}/files?pageSize=10000`, undefined, deps);
  return [...(json.data ?? [])].sort((a, b) => b.id - a.id);
}

async function chunkedPost<TBody, TItem>(path: string, ids: TBody[], build: (ids: TBody[]) => string, deps?: CurseForgeDeps): Promise<TItem[]> {
  const out: TItem[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const json = await cfRequest<{ data: TItem[] }>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: build(ids.slice(i, i + 100)),
    }, deps);
    out.push(...(json.data ?? []));
  }
  return out;
}

export function getCurseForgeFiles(fileIds: number[], deps?: CurseForgeDeps): Promise<CurseForgeFile[]> {
  return chunkedPost<number, CurseForgeFile>("/mods/files", fileIds, (ids) => JSON.stringify({ fileIds: ids }), deps);
}

export function getCurseForgeMods(modIds: number[], deps?: CurseForgeDeps): Promise<CurseForgeMod[]> {
  return chunkedPost<number, CurseForgeMod>("/mods", modIds, (ids) => JSON.stringify({ modIds: ids }), deps);
}

/** Numeric category id for a category slug, cached per game (unknown slugs → undefined = no filter). */
const categoryCache = new Map<number, { bySlug: Map<string, number>; fetchedAt: number }>();
const CATEGORY_TTL_MS = 10 * 60 * 1000;
export async function curseForgeCategoryId(gameId: number, slug: string, deps?: CurseForgeDeps): Promise<number | undefined> {
  const cached = categoryCache.get(gameId);
  if (cached && Date.now() - cached.fetchedAt < CATEGORY_TTL_MS) return cached.bySlug.get(slug);
  try {
    const json = await cfRequest<{ data: { id: number; slug?: string; name: string }[] }>(
      `/categories?gameId=${gameId}&classId=6`, // classId 6 = mods, keeps the map small
      undefined,
      deps
    );
    const bySlug = new Map<string, number>();
    for (const c of json.data ?? []) {
      if (c.slug) bySlug.set(c.slug, c.id);
      bySlug.set(c.name.toLowerCase(), c.id);
    }
    categoryCache.set(gameId, { bySlug, fetchedAt: Date.now() });
    return bySlug.get(slug);
  } catch {
    return undefined;
  }
}

/**
 * Pick the newest installable file for the server's Minecraft version and
 * loader. Files the author locked to CurseForge distribution are skipped —
 * they can't be downloaded through the API at all. An omitted loader means
 * "no constraint"; an explicit null means a vanilla server, which cannot
 * load loader-marked files.
 */
export function pickCompatibleCfFile(
  files: CurseForgeFile[],
  opts: { mcVersion?: string | null; loader?: LoaderType | null }
): CurseForgeFile | null {
  const sorted = [...files].sort((a, b) => b.id - a.id);
  for (const file of sorted) {
    if (file.isAlternate) continue;
    if (file.isAvailable === false) continue;
    if (opts.mcVersion && file.gameVersions.length > 0 && !file.gameVersions.includes(opts.mcVersion)) continue;
    if (opts.loader !== undefined && !cfFileLoaderMatches(file, opts.loader)) continue;
    return file;
  }
  return null;
}

/** NeoForge servers also load legacy Forge jars — mirror the installer's rule. */
export function cfFileLoaderMatches(file: CurseForgeFile, loader: LoaderType | null): boolean {
  const t = file.modLoaderType ?? 0;
  if (t === 0) return true; // "Any"
  if (!loader) return false; // file demands a loader the server doesn't have
  if (loader === "neoforge" && t === CURSEFORGE_LOADER_IDS.forge) return true;
  return CURSEFORGE_LOADER_IDS[loader] === t;
}

/**
 * The download URL for a file. The API usually returns one directly; when it
 * doesn't, the edge CDN layout (`/files/<k>/<id%1000>/<fileName>`) is derived
 * from the id. Files with third-party distribution disabled have neither —
 * refuse loudly instead of downloading nothing.
 */
export function curseForgeDownloadUrl(file: CurseForgeFile): string {
  if (file.downloadUrl) return file.downloadUrl;
  if (file.isAvailable === false) {
    throw new Error(
      `'${file.displayName}' can't be downloaded — the author disabled third-party distribution on CurseForge.`
    );
  }
  return `https://edge.forgecdn.net/files/${Math.floor(file.id / 1000)}/${file.id % 1000}/${encodeURIComponent(file.fileName)}`;
}

/** sha1 for the given file when the API reports one (pack imports verify against it). */
export function curseForgeSha1(file: CurseForgeFile): string | null {
  return file.hashes?.find((h) => h.algo === 1)?.value.toLowerCase() ?? null;
}

export interface CfInstallCandidate {
  mod: CurseForgeMod;
  file: CurseForgeFile;
  allFiles: CurseForgeFile[];
}

/**
 * Resolve a CurseForge mod to the file to install: an exact fileId pin wins
 * (pack exports), then an exact displayName/fileName pin (search cards), then
 * the newest file compatible with the server's version and loader.
 */
export async function resolveCfInstall(
  modId: string,
  opts: { mcVersion?: string | null; loader?: LoaderType | null; fileId?: number | null; displayName?: string | null },
  deps?: CurseForgeDeps
): Promise<CfInstallCandidate> {
  const id = Number(modId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`'${modId}' is not a CurseForge mod id.`);
  }
  const mod = await getCurseForgeMod(id, deps);
  if (mod.classId === CURSEFORGE_CLASS_IDS.modpacks) {
    // A modpack zip filed into mods/ would boot fine on vanilla (the folder
    // is ignored) and "succeed" while doing nothing — refuse with the route
    // that actually handles packs.
    throw new Error(
      `'${mod.name}' is a CurseForge modpack, not a single mod — install it from the Packs tab in the Mod Manager. Pack installs bring their own loader and Minecraft version.`
    );
  }
  if (opts.fileId) {
    const files = await getCurseForgeFiles([opts.fileId], deps);
    const file = files.find((f) => f.modId === id);
    if (!file) throw new Error(`CurseForge file ${opts.fileId} no longer exists.`);
    return { mod, file, allFiles: [file] };
  }
  const allFiles = await getCurseForgeModFiles(id, deps);
  const pinned = opts.displayName
    ? allFiles.find((f) => f.displayName === opts.displayName || f.fileName === opts.displayName) ?? null
    : null;
  const file = pinned ?? pickCompatibleCfFile(allFiles, opts);
  if (!file) {
    throw new Error(
      `No downloadable file of ${mod.name} matches${opts.mcVersion ? ` Minecraft ${opts.mcVersion}` : ""}${opts.loader ? ` (${opts.loader})` : ""}.`
    );
  }
  return { mod, file, allFiles };
}

/**
 * Walk the REQUIRED dependency graph from a root file and return the dep
 * files that still need installing, dependency-first. `lookup` resolves a
 * fileId to its file (network — injected for tests), `alreadyInstalled`
 * filters by the dep mod's id. Cycle-safe, depth-capped.
 */
export async function collectRequiredCfFiles(
  root: CurseForgeFile,
  lookup: (fileId: number) => CurseForgeFile | null | Promise<CurseForgeFile | null>,
  alreadyInstalled: (modId: number) => boolean
): Promise<{ order: CurseForgeFile[]; missingFileIds: number[] }> {
  const order: CurseForgeFile[] = [];
  const missingFileIds: number[] = [];
  const seenMods = new Set<number>([root.modId]);
  let queue: CurseForgeFile[] = [root];
  let depth = 0;
  const MAX_DEPTH = 12;

  while (queue.length > 0 && depth < MAX_DEPTH) {
    const next: CurseForgeFile[] = [];
    for (const file of queue) {
      for (const dep of file.dependencies ?? []) {
        if (dep.relationType !== REQUIRED_DEPENDENCY) continue;
        const depFile = await lookup(dep.fileId);
        if (!depFile) {
          if (!missingFileIds.includes(dep.fileId)) missingFileIds.push(dep.fileId);
          continue;
        }
        if (seenMods.has(depFile.modId)) continue;
        seenMods.add(depFile.modId);
        if (alreadyInstalled(depFile.modId)) continue;
        order.push(depFile);
        next.push(depFile);
      }
    }
    queue = next;
    depth++;
  }
  return { order, missingFileIds };
}

export interface CfManifest {
  manifestType: string;
  manifestVersion: number;
  name: string;
  version?: string;
  minecraft: { version: string; modLoaders: { id: string; primary?: boolean }[] };
  files: { projectID: number; fileID: number; required: boolean }[];
  overrides?: string;
}

/** Parse a CurseForge `manifest.json` out of a pack zip (validated). */
export function readCurseForgeManifest(zip: AdmZip): CfManifest {
  const entry = zip.getEntry("manifest.json");
  if (!entry) throw new Error("Not a CurseForge modpack: manifest.json is missing from the archive.");
  const m = JSON.parse(zip.readAsText(entry));
  if (m?.manifestType !== "minecraftModpack" || m?.manifestVersion !== 1) {
    throw new Error(`Unsupported CurseForge manifest (type ${m?.manifestType ?? "missing"}, version ${m?.manifestVersion ?? "missing"}).`);
  }
  if (typeof m?.minecraft?.version !== "string" || !Array.isArray(m?.files)) {
    throw new Error("Malformed CurseForge manifest: minecraft.version or files is missing.");
  }
  return m as CfManifest;
}

/** Which loader a CurseForge manifest pins via its primary modLoader entry, if any. */
export function cfLoaderRequirement(m: CfManifest): { type: LoaderType; version: string } | null {
  const primary = (m.minecraft.modLoaders ?? []).find((l) => l.primary) ?? m.minecraft.modLoaders?.[0];
  if (!primary?.id) return null;
  const idx = primary.id.indexOf("-");
  if (idx === -1) return null;
  const kind = primary.id.slice(0, idx);
  const version = primary.id.slice(idx + 1);
  if (kind === "forge" || kind === "fabric" || kind === "quilt" || kind === "neoforge") {
    return { type: kind, version };
  }
  return null;
}

/**
 * Safe overrides-folder prefix for a manifest. CurseForge lets authors rename
 * the overrides folder — the value is untrusted input, so only a single
 * plain segment is accepted and anything else falls back to `overrides`.
 */
export function cfOverridesPrefix(m: CfManifest): string {
  const name = m.overrides && /^[A-Za-z0-9_-]+$/.test(m.overrides) ? m.overrides : "overrides";
  return `${name}/`;
}

/**
 * Resolve every required file of a CurseForge pack to its API metadata
 * (download URL, sha1, mod names) BEFORE a snapshot is spent. Optional
 * (`required: false`) files are skipped — without per-file env metadata they
 * are usually client-side, and a skipped mod just warns instead of risking
 * the boot test. Throws with a user-presentable message when the pack
 * references files that are gone or locked to CurseForge distribution.
 */
export async function resolveCfPackFiles(
  manifest: CfManifest,
  deps?: CurseForgeDeps
): Promise<{ files: CurseForgeFile[]; modNames: Map<number, string>; skippedOptional: number }> {
  const unique = new Map<number, { projectID: number; fileID: number; required: boolean }>();
  for (const f of manifest.files ?? []) {
    if (typeof f?.projectID !== "number" || typeof f?.fileID !== "number") {
      throw new Error("Malformed CurseForge manifest: file entries must carry numeric projectID and fileID.");
    }
    const existing = unique.get(f.fileID);
    if (!existing || (existing.required === false && f.required !== false)) unique.set(f.fileID, f);
  }
  const required = Array.from(unique.values()).filter((f) => f.required !== false);
  const skippedOptional = unique.size - required.length;

  const apiFiles = required.length > 0 ? await getCurseForgeFiles(required.map((f) => f.fileID), deps) : [];
  const byFileId = new Map(apiFiles.map((f) => [f.id, f]));

  const files: CurseForgeFile[] = [];
  for (const entry of required) {
    const file = byFileId.get(entry.fileID);
    if (!file) {
      throw new Error(`This pack references CurseForge file ${entry.fileID}, which no longer exists on CurseForge.`);
    }
    // Fail closed here — before any snapshot — so distribution-locked files
    // and hash-less files abort the import instead of surfacing mid-install.
    curseForgeDownloadUrl(file);
    if (!curseForgeSha1(file)) {
      throw new Error(`'${file.displayName}' reports no sha1 hash — refusing to install an unverifiable file.`);
    }
    files.push(file);
  }

  const modIds = Array.from(new Set(files.map((f) => f.modId)));
  const mods = modIds.length > 0 ? await getCurseForgeMods(modIds, deps) : [];
  const modNames = new Map(mods.map((m) => [m.id, m.name]));
  return { files, modNames, skippedOptional };
}
