import { getPublicSupabaseClient } from "@/lib/backend/supabase";

/** A public realm surfaced on the marketing "Featured Realms" showcase. */
export type FeaturedRealm = {
  id: string;
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
  "id,name,description,game_slug,tags,price_cents,currency,like_count,download_count";

type RealmRow = {
  id: string;
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
