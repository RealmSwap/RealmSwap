import { getPublicSupabaseClient } from "@/lib/backend/supabase";

/** A public realm surfaced on the marketing "Featured Realms" showcase. */
export type FeaturedRealm = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  gameSlug: string | null;
  tags: string[];
  priceCents: number;
  currency: string;
  likeCount: number;
  downloadCount: number;
};

// Columns on the shared `realms` table (snake_case) we surface publicly.
const REALM_COLUMNS =
  "id,slug,name,description,game_slug,tags,price_cents,currency,like_count,download_count";

type RealmRow = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  game_slug: string | null;
  tags: string[] | null;
  price_cents: number | null;
  currency: string | null;
  like_count: number | null;
  download_count: number | null;
};

/**
 * Featured (most-liked) public realms for the marketing showcase. Read-only via
 * the anon key; RLS restricts results to publicly visible rows. Returns `[]` on
 * any error or when the backend isn't configured — the marketing page must never
 * break because the marketplace is empty or momentarily unavailable.
 */
export async function getFeaturedRealms(limit = 6): Promise<FeaturedRealm[]> {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("realms")
    .select(REALM_COLUMNS)
    .eq("visibility", "PUBLIC")
    .order("like_count", { ascending: false })
    .limit(limit)
    .returns<RealmRow[]>();

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    slug: r.slug ?? null,
    name: r.name,
    description: r.description ?? null,
    gameSlug: r.game_slug ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    priceCents: r.price_cents ?? 0,
    currency: r.currency ?? "usd",
    likeCount: r.like_count ?? 0,
    downloadCount: r.download_count ?? 0,
  }));
}

// --- Realm landing page (/r/[slug]). -----------------------------------------

/** Full public data for a realm's shareable landing page. */
export type PublicRealm = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  gameSlug: string | null;
  tags: string[];
  /** jsonb `payload` (already an object from the anon client, never a string). */
  payload: Record<string, unknown> | null;
  verifiedLevel: string | null;
  downloadCount: number;
  likeCount: number;
  createdAt: string | null;
  sellerId: string | null;
  /** Seller display name via the `profiles` join; null when none is set. */
  sellerName: string | null;
};

type RealmDetailRow = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  game_slug: string | null;
  tags: string[] | null;
  payload: Record<string, unknown> | null;
  verified_level: string | null;
  download_count: number | null;
  like_count: number | null;
  created_at: string | null;
  seller_id: string | null;
  seller: { display_name: string | null } | null;
};

/**
 * A single PUBLISHED realm by slug for its landing page. UNLISTED realms render
 * here too (shareable-link semantics); only PRIVATE/DRAFT/REMOVED are excluded,
 * and RLS is the hard boundary. Returns `null` when missing or unavailable.
 */
export async function getRealmBySlug(slug: string): Promise<PublicRealm | null> {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("realms")
    .select(
      "id, slug, name, description, game_slug, tags, payload, verified_level, download_count, like_count, created_at, seller_id, seller:profiles!seller_id(display_name)"
    )
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .in("visibility", ["PUBLIC", "UNLISTED"])
    .maybeSingle()
    .returns<RealmDetailRow>();

  if (error || !data || !data.slug) return null;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description ?? null,
    gameSlug: data.game_slug ?? null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    payload: data.payload ?? null,
    verifiedLevel: data.verified_level ?? null,
    downloadCount: data.download_count ?? 0,
    likeCount: data.like_count ?? 0,
    createdAt: data.created_at ?? null,
    sellerId: data.seller_id ?? null,
    sellerName: data.seller?.display_name ?? null,
  };
}

// --- Browse index (/realms). --------------------------------------------------

/** A realm card on the /realms browse index. */
export type RealmIndexItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  gameSlug: string | null;
  tags: string[];
  verifiedLevel: string | null;
  priceCents: number;
  currency: string;
  likeCount: number;
  downloadCount: number;
};

type RealmIndexRow = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  game_slug: string | null;
  tags: string[] | null;
  verified_level: string | null;
  price_cents: number | null;
  currency: string | null;
  like_count: number | null;
  download_count: number | null;
};

/**
 * PUBLISHED + PUBLIC realms for the browse index, most-liked first. Realms
 * without a slug can never be linked, so they are excluded at the query.
 * `total` is the unfiltered row count (may exceed the returned page).
 * Returns an empty list on any error — the index must never break.
 */
export async function getPublicRealms(
  limit = 60
): Promise<{ realms: RealmIndexItem[]; total: number }> {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return { realms: [], total: 0 };

  const [listResult, countResult] = await Promise.all([
    supabase
      .from("realms")
      .select(
        "id,slug,name,description,game_slug,tags,verified_level,price_cents,currency,like_count,download_count"
      )
      .eq("status", "PUBLISHED")
      .eq("visibility", "PUBLIC")
      .not("slug", "is", null)
      .order("like_count", { ascending: false })
      .limit(limit)
      .returns<RealmIndexRow[]>(),
    supabase
      .from("realms")
      .select("id", { count: "exact", head: true })
      .eq("status", "PUBLISHED")
      .eq("visibility", "PUBLIC")
      .not("slug", "is", null),
  ]);

  const { data, error } = listResult;
  if (error || !data) return { realms: [], total: 0 };

  return {
    realms: data.map((r) => ({
      id: r.id,
      slug: r.slug as string,
      name: r.name,
      description: r.description ?? null,
      gameSlug: r.game_slug ?? null,
      tags: Array.isArray(r.tags) ? r.tags : [],
      verifiedLevel: r.verified_level ?? null,
      priceCents: r.price_cents ?? 0,
      currency: r.currency ?? "usd",
      likeCount: r.like_count ?? 0,
      downloadCount: r.download_count ?? 0,
    })),
    total: countResult.count ?? data.length,
  };
}
