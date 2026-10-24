/**
 * Satisfactory mod catalog for ficsit.app — search, version resolution and
 * the SML (Satisfactory Mod Loader) framework behind the "ficsit" provider.
 *
 * Ground truths probed live 2026-10-24 that shape this module:
 *
 * - The GraphQL endpoint is https://api.ficsit.app/v2/query, keyless and
 *   unthrottled at the scales we need (unlike umod.org — batch update checks
 *   are a single getMods query here and are supported).
 * - A mod's server support is EXPLICIT: each version carries per-target
 *   downloads (`Windows` / `WindowsServer` / `LinuxServer`). Mods whose
 *   release lacks a WindowsServer target are client-only — the docs are
 *   blunt that client files "will not work" on dedicated servers, so those
 *   refuse closed before a snapshot is spent.
 * - SML 3.x is itself a ficsit mod (reference "SML") and installs exactly
 *   like one: every mod zip extracts to FactoryGame/Mods/<mod_reference>/
 *   with a `.smm` hash marker (the layout ficsit-cli's installer uses —
 *   verified against its source). The zip entries are rooted at the plugin
 *   files (verified against real SML and NukeRebar WindowsServer zips).
 * - Downloads are relative links resolved against api.ficsit.app; each
 *   version also ships a sha256 `hash` — recorded in the `.smm` marker so
 *   ficsit-cli/SMR treat our installs as their own.
 */

export const FICSIT_API = "https://api.ficsit.app";
const FICSIT_QUERY_URL = "https://api.ficsit.app/v2/query";

/** The boot loader every Satisfactory mod needs (installed like a mod). */
export const FICSIT_SML_REFERENCE = "SML";
/** Marker written by ficsit-cli/SMR; proves a mod dir is a managed install. */
export const FICSIT_SMM_MARKER = ".smm";
/** The target a Windows dedicated server runs. */
export const FICSIT_SERVER_TARGET = "WindowsServer";

export interface FicsitTarget {
  targetName: string;
  link: string;
}

export interface FicsitVersion {
  version: string;
  hash?: string | null;
  targets: FicsitTarget[];
  dependencies?: { mod_id: string; optional?: boolean }[];
}

export interface FicsitMod {
  id: string;
  name: string;
  modReference: string;
  downloads?: number;
  latestVersion: string | null;
}

export interface FicsitDeps {
  /** Only ever called with the query URL this module builds. */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

async function ficsitGraphQL<T = any>(query: string, variables: Record<string, unknown>, deps?: FicsitDeps): Promise<T> {
  const doFetch = deps?.fetchImpl ?? fetch;
  const res = await doFetch(FICSIT_QUERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`ficsit.app request failed (${res.status}).`);
  }
  const json = await res.json();
  if (json?.errors?.length) {
    throw new Error(`ficsit.app query failed: ${json.errors[0]?.message ?? "unknown error"}`);
  }
  return json?.data as T;
}

const MOD_SUMMARY_FIELDS = `
  id
  name
  mod_reference
  downloads
  latestVersions { release { ver: version } }
`;

/** Search the ficsit.app catalog (keyless, supports Satisfactory only). */
export async function searchFicsitMods(
  opts: { query?: string; offset?: number } = {},
  deps?: FicsitDeps
): Promise<{ mods: FicsitMod[]; total: number }> {
  const data = await ficsitGraphQL<{ getMods: { count: number; mods: any[] } }>(
    `query($filter: ModFilter) { getMods(filter: $filter) { count mods { ${MOD_SUMMARY_FIELDS} } } }`,
    { filter: { search: (opts.query ?? "").trim(), limit: 20, offset: opts.offset ?? 0 } },
    deps
  );
  const mods = (data.getMods?.mods ?? []).map(mapFicsitMod).filter((m): m is FicsitMod => m !== null);
  return { mods, total: data.getMods?.count ?? mods.length };
}

function mapFicsitMod(raw: any): FicsitMod | null {
  if (!raw || typeof raw.id !== "string" || !raw.id) return null;
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : raw.mod_reference,
    modReference: typeof raw.mod_reference === "string" ? raw.mod_reference : raw.id,
    downloads: typeof raw.downloads === "number" ? raw.downloads : 0,
    latestVersion: raw.latestVersions?.release?.ver ?? null,
  };
}

/** Full version detail for one mod (latest release or a pinned version). */
export async function getFicsitModVersion(
  args: { modId: string; versionNumber?: string },
  deps?: FicsitDeps
): Promise<{ mod: FicsitMod; version: FicsitVersion } | null> {
  const { modId, versionNumber } = args;
  const versionSelection = `
    ver: version
    hash
    targets { targetName link }
    dependencies { mod_id optional }
  `;
  const data = await ficsitGraphQL<any>(
    versionNumber
      ? `query($id: ModID!, $v: String!) { getMod(modId: $id) {
           id name mod_reference downloads
           latestVersions { release { ${versionSelection} } }
           pinned: version(version: $v) { ${versionSelection} }
         } }`
      : `query($id: ModID!) { getMod(modId: $id) {
           id name mod_reference downloads
           latestVersions { release { ${versionSelection} } }
         } }`,
    versionNumber ? { id: modId, v: versionNumber } : { id: modId },
    deps
  );
  const raw = data?.getMod;
  if (!raw) return null;
  const version = versionNumber ? raw.pinned : raw.latestVersions?.release;
  if (!version) return null;
  return {
    mod: {
      id: raw.id, name: raw.name, modReference: raw.mod_reference,
      downloads: raw.downloads, latestVersion: raw.latestVersions?.release?.ver ?? null,
    },
    version: {
      version: version.ver,
      hash: version.hash ?? null,
      targets: version.targets ?? [],
      dependencies: version.dependencies ?? [],
    },
  };
}

/** Resolve a mod by its stable reference (collections import path). */
export async function getFicsitModByReference(reference: string, deps?: FicsitDeps): Promise<FicsitMod | null> {
  const data = await ficsitGraphQL<{ getMods: { mods: any[] } }>(
    `query($filter: ModFilter) { getMods(filter: $filter) { mods { ${MOD_SUMMARY_FIELDS} } } }`,
    { filter: { references: [reference], limit: 1 } },
    deps
  );
  const raw = data.getMods?.mods?.[0];
  return raw ? mapFicsitMod(raw) : null;
}

/**
 * Pick the dedicated-server download of a version. Client-only mods (no
 * WindowsServer target) refuse with the docs' own reasoning — installing
 * client files on a server produces vague in-game errors at best.
 */
export function pickFicsitServerDownload(version: FicsitVersion): string | null {
  const target = version.targets.find((t) => t.targetName === FICSIT_SERVER_TARGET);
  return target ? `${FICSIT_API}${target.link}` : null;
}

/** Resolve references → GraphQL ids in one batched query (update checks). */
export async function getFicsitModsByReferences(
  references: string[],
  deps?: FicsitDeps
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (references.length === 0) return out;
  const data = await ficsitGraphQL<{ getMods: { mods: any[] } }>(
    `query($filter: ModFilter) { getMods(filter: $filter) { mods { id mod_reference } } }`,
    { filter: { references, limit: references.length } },
    deps
  );
  for (const raw of data.getMods?.mods ?? []) {
    if (typeof raw.id === "string" && typeof raw.mod_reference === "string") {
      out.set(raw.mod_reference, raw.id);
    }
  }
  return out;
}

/** One batched latest-version lookup for update checks (keyless, no throttle). */
export async function getFicsitLatestVersions(
  modIds: string[],
  deps?: FicsitDeps
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (modIds.length === 0) return out;
  const data = await ficsitGraphQL<{ getMods: { mods: any[] } }>(
    `query($filter: ModFilter) { getMods(filter: $filter) { mods { id latestVersions { release { ver: version } } } } }`,
    { filter: { ids: modIds, limit: modIds.length } },
    deps
  );
  for (const raw of data.getMods?.mods ?? []) {
    out.set(raw.id, raw.latestVersions?.release?.ver ?? null);
  }
  return out;
}
