/**
 * Steam Workshop Web API client.
 *
 * Search uses IPublishedFileService/QueryFiles/v1 with an API key
 * (query_type 9 = ranked-by-text-search); details use the keyless
 * ISteamRemoteStorage/GetPublishedFileDetails/v1 POST. Probed live:
 * - text search needs query_type=9 — the lower query types ignore
 *   search_text entirely;
 * - pagination is cursor-based (`cursor="*"`, then response.next_cursor);
 *   pages are cached here so the provider can serve offset-based callers;
 * - PZ items have no direct file_url (depot-hosted), so installs download
 *   via SteamCMD — see workshopDownload.ts;
 * - the API exposes no per-item mod ID and no dependency list; the mod ID
 *   lives in mod.info inside the downloaded item.
 */

export function steamApiKey(): string {
  return (process.env.STEAM_API_KEY ?? "").trim();
}

/** Steam AppIDs with Workshop install strategies in this app. */
export const WORKSHOP_APP_IDS: Record<string, number> = {
  ZOMBOID: 108600,
};

export function isWorkshopSearchable(game: string): boolean {
  return Boolean(WORKSHOP_APP_IDS[game.toUpperCase()]);
}

export interface WorkshopSearchItem {
  workshopId: string;
  title: string;
  authorSteamId: string;
  description: string;
  /** Last update on the workshop, ISO — doubles as the install version. */
  timeUpdated: string;
  subscriptions: number;
  previewUrl: string;
  tags: string[];
  fileSize: number;
}

interface QueryFileItem {
  publishedfileid: string;
  title: string;
  creator: string;
  file_description?: string;
  time_updated?: string;
  subscriptions?: number;
  lifetime_subscriptions?: number;
  preview_url?: string;
  tags?: { tag: string }[];
  file_size?: string;
  banned?: number;
}

const UA = "RealmSwap/0.5 (github.com/RealmSwap/RealmSwap)";

export interface WorkshopDeps {
  fetchImpl?: typeof fetch;
  apiKey?: string | null;
}

interface QueryFilesDeps extends WorkshopDeps {
  /** Map a QueryFiles page — replaced in tests. */
  fetchPage?: (cursor: string) => Promise<{ items: QueryFileItem[]; nextCursor: string | null }>;
}

async function steamFetchJson<T>(url: string, deps?: WorkshopDeps): Promise<T> {
  const res = await (deps?.fetchImpl ?? fetch)(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Steam API request failed (${res.status})`);
  return res.json() as Promise<T>;
}

const PAGE_SIZE = 50;
const CURSOR_CACHE_TTL = 5 * 60 * 1000;
const CURSOR_CACHE_MAX = 60;

interface CursorCacheEntry {
  items: WorkshopSearchItem[];
  cursor: string | null;
  expiresAt: number;
}

const cursorCache = new Map<string, CursorCacheEntry>();

function toItem(f: QueryFileItem): WorkshopSearchItem {
  return {
    workshopId: f.publishedfileid,
    title: f.title,
    authorSteamId: f.creator,
    description: f.file_description ?? "",
    timeUpdated: new Date(Number(f.time_updated ?? 0) * 1000).toISOString(),
    subscriptions: Number(f.lifetime_subscriptions ?? f.subscriptions ?? 0),
    previewUrl: f.preview_url ?? "",
    tags: (f.tags ?? []).map((t) => t.tag),
    fileSize: Number(f.file_size ?? 0),
  };
}

// query_type 9 = ranked by text search; 3 = most subscribed. The other
// sort orders fall back to text search (probed: other types ignore
// search_text, so they would return unrelated results).
const SORT_QUERY_TYPES: Record<string, string> = {
  relevance: "9",
  downloads: "3",
  rating: "3",
  updated: "9",
};

/**
 * Offset-paginated workshop search over the API's cursor pagination.
 * Pages are cached per (appid, query, sort) so repeated UI pages reuse
 * one cursor chain; offsets beyond the cache walk forward lazily.
 */
export async function searchWorkshop(opts: {
  query: string;
  game: string;
  offset?: number;
  sort?: string;
  deps?: QueryFilesDeps;
}): Promise<WorkshopSearchItem[]> {
  const appId = WORKSHOP_APP_IDS[opts.game.toUpperCase()];
  if (!appId) throw new Error(`No Steam Workshop AppID for game ${opts.game}`);

  const apiKey = opts.deps?.apiKey !== undefined ? opts.deps.apiKey : steamApiKey();
  if (!apiKey) throw new Error("STEAM_API_KEY is not configured — Workshop search is unavailable.");

  const queryType = SORT_QUERY_TYPES[opts.sort ?? "relevance"] ?? "9";
  const offset = Math.max(0, opts.offset ?? 0);
  const cacheKey = `${appId}:${queryType}:${opts.query.trim().toLowerCase()}`;

  let entry = cursorCache.get(cacheKey);
  if (!entry || entry.expiresAt < Date.now()) {
    entry = { items: [], cursor: "*", expiresAt: Date.now() + CURSOR_CACHE_TTL };
    cursorCache.set(cacheKey, entry);
    if (cursorCache.size > CURSOR_CACHE_MAX) {
      const oldest = cursorCache.keys().next().value;
      if (oldest) cursorCache.delete(oldest);
    }
  }

  const fetchPage =
    opts.deps?.fetchPage ??
    (async (cursor: string) => {
      const params = new URLSearchParams({
        key: apiKey,
        appid: String(appId),
        query_type: queryType,
        numperpage: String(PAGE_SIZE),
        return_metadata: "true",
        cursor,
      });
      if (opts.query.trim()) params.set("search_text", opts.query.trim());
      const json = await steamFetchJson<{ response: { publishedfiledetails?: QueryFileItem[]; next_cursor?: string } }>(
        `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params}`,
        opts.deps
      );
      const files = (json.response?.publishedfiledetails ?? []).filter((f) => !f.banned);
      return { items: files, nextCursor: json.response?.next_cursor ?? null };
    });

  while (entry.items.length < offset + PAGE_SIZE && entry.cursor) {
    const page = await fetchPage(entry.cursor);
    entry.items.push(...page.items.map(toItem));
    entry.cursor = page.nextCursor;
  }

  return entry.items.slice(offset, offset + PAGE_SIZE);
}

/** Best-effort display names for creator SteamIDs (keyed, ≤100 per call). */
export async function resolveAuthorNames(
  steamIds: string[],
  deps?: WorkshopDeps
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(steamIds.filter(Boolean))).slice(0, 100);
  if (unique.length === 0) return {};
  const apiKey = deps?.apiKey !== undefined ? deps.apiKey : steamApiKey();
  if (!apiKey) return {};
  try {
    const json = await steamFetchJson<{ response: { players?: { steamid: string; personaname: string }[] } }>(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${unique.join(",")}`,
      deps
    );
    const names: Record<string, string> = {};
    for (const p of json.response?.players ?? []) names[p.steamid] = p.personaname;
    return names;
  } catch {
    return {};
  }
}

export interface WorkshopDetail {
  workshopId: string;
  title: string;
  timeUpdated: string;
}

/**
 * Batched item details (keyless). Used for update checks: time_updated
 * compared against the installed row's version. Items that no longer
 * exist (or errored) are simply absent from the result.
 */
export async function getWorkshopDetails(
  workshopIds: string[],
  deps?: WorkshopDeps
): Promise<Map<string, WorkshopDetail>> {
  const out = new Map<string, WorkshopDetail>();
  const ids = Array.from(new Set(workshopIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const body = new URLSearchParams({ itemcount: String(ids.length) });
  ids.forEach((id, i) => body.append(`publishedfileids[${i}]`, id));
  const res = await (deps?.fetchImpl ?? fetch)(
    "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
    { method: "POST", body, headers: { "User-Agent": UA } }
  );
  if (!res.ok) throw new Error(`Steam API request failed (${res.status})`);
  const json = (await res.json()) as {
    response?: { publishedfiledetails?: { result?: number; publishedfileid: string; title: string; time_updated?: string }[] };
  };
  for (const d of json.response?.publishedfiledetails ?? []) {
    if (d.result !== 1) continue;
    out.set(d.publishedfileid, {
      workshopId: d.publishedfileid,
      title: d.title,
      timeUpdated: new Date(Number(d.time_updated ?? 0) * 1000).toISOString(),
    });
  }
  return out;
}

export function workshopWebsiteUrl(workshopId: string): string {
  return `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`;
}
