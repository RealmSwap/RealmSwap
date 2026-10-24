/**
 * uMod (Oxide) plugin catalog for Rust servers — search, metadata, plugin
 * installation and Oxide framework provisioning behind the "umod" provider.
 *
 * Ground truths probed live 2026-10-24 that shape this module:
 *
 * - The JSON API lives on umod.org itself (api.umod.org does not resolve).
 *   /plugins/search.json is a Laravel paginator (10 per page) covering
 *   plugins for ALL uMod games — there is no game filter parameter, so
 *   results are filtered here to category_tags "rust"/"universal".
 * - Rate limiting is aggressive (429 within a few rapid requests), so every
 *   search is cached per (query, page) and 429s surface as errors instead
 *   of being retried into a longer ban. Update checks would need one
 *   request per installed plugin, so they are deliberately unsupported.
 * - A plugin's distributable is its C# source, always at
 *   https://umod.org/plugins/<Name>.cs — the Oxide framework compiles it at
 *   server boot, so there are no dependency graphs or loader states to
 *   resolve. Oxide itself ships from https://umod.org/games/rust/download
 *   as a zip of RustDedicated_Data/Managed patches extracted over the
 *   server root.
 */

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/db";
import { downloadFile } from "@/lib/download";
import { safeJoin } from "@/lib/safePath";
import { extractThunderstorePackage } from "@/lib/mods/thunderstore";

export interface UmodPlugin {
  /** The .cs file name — how Oxide identifies the plugin (e.g. "Teleporter"). */
  name: string;
  slug: string;
  title: string;
  author: string;
  description: string;
  /** Version without the "v" prefix (e.g. "2.0.0"). */
  latestReleaseVersion: string;
  latestReleaseAt: string;
  downloads: number;
  downloadUrl: string;
  iconUrl?: string;
  /** Comma-separated game tags from uMod ("rust", "universal", ...). */
  categoryTags: string;
}

export interface UmodDeps {
  /** Only ever called with the string URLs this module builds. */
  fetchImpl?: (url: string) => Promise<Response>;
}

const SEARCH_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map<string, { plugins: UmodPlugin[]; total: number; fetchedAt: number }>();

/** True when a plugin's game tags include Rust (or are game-agnostic). */
export function isRustPlugin(categoryTags: string): boolean {
  const tags = categoryTags.split(",").map((t) => t.trim().toLowerCase());
  return tags.includes("rust") || tags.includes("universal");
}

/** Map one search.json row; null when it lacks the fields we install from. */
export function mapUmodPlugin(raw: any): UmodPlugin | null {
  if (!raw || typeof raw.name !== "string" || !raw.name || typeof raw.download_url !== "string") {
    return null;
  }
  return {
    name: raw.name,
    slug: typeof raw.slug === "string" && raw.slug ? raw.slug : raw.name,
    title: typeof raw.title === "string" && raw.title ? raw.title : raw.name,
    author: typeof raw.author === "string" ? raw.author : "",
    description: typeof raw.description === "string" ? raw.description : "",
    latestReleaseVersion:
      typeof raw.latest_release_version === "string" ? raw.latest_release_version : "",
    latestReleaseAt: typeof raw.latest_release_at === "string" ? raw.latest_release_at : "",
    downloads: typeof raw.downloads === "number" ? raw.downloads : 0,
    downloadUrl: raw.download_url,
    iconUrl: typeof raw.icon_url === "string" ? raw.icon_url : undefined,
    categoryTags: typeof raw.category_tags === "string" ? raw.category_tags : "",
  };
}

async function umodJson<T = any>(url: string, deps?: UmodDeps): Promise<T> {
  const doFetch = deps?.fetchImpl ?? fetch;
  const res = await doFetch(url);
  if (res.status === 429) {
    throw new Error("uMod rate limit hit — try again in a minute.");
  }
  if (!res.ok) {
    throw new Error(`uMod request failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

/**
 * Search uMod's plugin catalog and keep the plugins that run on Rust. One
 * request per (query, page), cached 10 minutes — the catalog spans all uMod
 * games, so a page can return few (or no) Rust matches for a query.
 */
export async function searchUmodPlugins(
  opts: { query?: string; offset?: number } = {},
  deps?: UmodDeps
): Promise<{ plugins: UmodPlugin[]; total: number }> {
  const query = (opts.query ?? "").trim();
  const page = Math.floor((opts.offset ?? 0) / 10) + 1;
  const cacheKey = `${query}|${page}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SEARCH_TTL_MS) {
    return { plugins: cached.plugins, total: cached.total };
  }

  const params = new URLSearchParams({ search: query, page: String(page) });
  const json = await umodJson(`https://umod.org/plugins/search.json?${params.toString()}`, deps);
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  const total: number = typeof json?.total === "number" ? json.total : rows.length;
  const plugins = rows
    .map(mapUmodPlugin)
    .filter((p): p is UmodPlugin => p !== null && isRustPlugin(p.categoryTags));
  searchCache.set(cacheKey, { plugins, total, fetchedAt: Date.now() });
  return { plugins, total };
}

/** Oxide framework zip (RustDedicated_Data/Managed patches) for the server root. */
export const OXIDE_CORE_DOWNLOAD_URL = "https://umod.org/games/rust/download";
/** Marker file the Oxide zip adds under the server root. */
export const OXIDE_CORE_MARKER = "RustDedicated_Data/Managed/Oxide.Core.dll";
export const OXIDE_CORE_PACKAGE_ID = "Oxide";

export function oxidePluginsDir(rustDir: string): string {
  return path.join(rustDir, "Oxide", "plugins");
}

/**
 * Provision the Oxide framework: download the uMod Oxide.Rust zip and
 * extract it over the server root. Idempotent via the Oxide.Core.dll marker.
 */
export async function installOxideCore(args: {
  serverId: string;
  rustDir: string;
}): Promise<void> {
  const { serverId, rustDir } = args;
  if (fs.existsSync(path.join(rustDir, OXIDE_CORE_MARKER))) return;

  const tempZip = safeJoin(rustDir, ".oxide-core.staging.zip");
  await downloadFile(OXIDE_CORE_DOWNLOAD_URL, tempZip);
  try {
    // Per-entry re-anchored extraction (traversal-safe); no wrapper folder
    // to strip — entries are rooted at RustDedicated_Data/.
    extractThunderstorePackage(new AdmZip(tempZip), rustDir);
  } catch (err: any) {
    throw new Error(`Failed to extract Oxide: ${err.message}`);
  } finally {
    try { fs.unlinkSync(tempZip); } catch (_) {}
  }

  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "umod", packageId: OXIDE_CORE_PACKAGE_ID } },
    update: { version: "release" },
    create: {
      serverId,
      provider: "umod",
      packageId: OXIDE_CORE_PACKAGE_ID,
      version: "release",
      name: "Oxide/uMod framework",
    },
  });
  fs.mkdirSync(oxidePluginsDir(rustDir), { recursive: true });
}

/**
 * Install a uMod plugin: download its .cs source into Oxide/plugins/ and
 * record a row keyed by the plugin name. Provisions the Oxide framework
 * first when it is missing. Without a search-card pin the download URL is
 * derived from the plugin name and the version comes (best-effort) from the
 * plugin's metadata endpoint.
 */
export async function installRustUmodPlugin(args: {
  serverId: string;
  rustDir: string;
  packageId: string;
  name?: string;
  /** Pinned version from a search card or collection export. */
  version?: string;
  downloadUrl?: string;
  warnings: string[];
}): Promise<void> {
  const { serverId, rustDir, packageId, name, version, downloadUrl, warnings } = args;

  if (!fs.existsSync(path.join(rustDir, OXIDE_CORE_MARKER))) {
    await installOxideCore({ serverId, rustDir });
  }

  let url = downloadUrl ?? "";
  let resolvedVersion = version ?? "";
  let title = name ?? packageId;
  if (!url) {
    let meta: any = null;
    try {
      meta = await umodJson(`https://umod.org/plugins/${encodeURIComponent(packageId)}.json`);
    } catch (err: any) {
      warnings.push(`Could not fetch uMod metadata for ${packageId}: ${err.message}`);
    }
    url = typeof meta?.download_url === "string" && meta.download_url
      ? meta.download_url
      : `https://umod.org/plugins/${encodeURIComponent(packageId)}.cs`;
    if (!resolvedVersion && typeof meta?.latest_release_version === "string") {
      resolvedVersion = meta.latest_release_version;
    }
    if (typeof meta?.title === "string" && meta.title) title = meta.title;
  }

  const pluginsDir = oxidePluginsDir(rustDir);
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
  }
  const dest = safeJoin(pluginsDir, `${packageId}.cs`);
  await downloadFile(url, dest);

  await prisma.modInstallation.upsert({
    where: { serverId_provider_packageId: { serverId, provider: "umod", packageId } },
    update: { name: title, ...(resolvedVersion ? { version: resolvedVersion } : {}) },
    create: {
      serverId,
      provider: "umod",
      packageId,
      version: resolvedVersion || "unknown",
      name: title,
    },
  });
}

/** Remove a plugin's .cs file; the framework forgets it at next boot. */
export function removeRustUmodPlugin(rustDir: string, packageId: string): void {
  const pluginPath = safeJoin(oxidePluginsDir(rustDir), `${packageId}.cs`);
  try {
    fs.unlinkSync(pluginPath);
  } catch {
    // Already gone — reconcile/uninstall treat that as success.
  }
}
