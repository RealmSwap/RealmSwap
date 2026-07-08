import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Map a cloud `realms` row (with embedded seller + the caller's favorite) to the
// shape the marketplace UI expects (comma-string tags, JSON-string payloads,
// camelCase, derived author). A favorite = the presence of a realm_votes row;
// `like_count` is surfaced as the favorite count.
function mapRealmToTemplate(r: any) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    author: r.seller_id ? (r.seller?.display_name ?? "Community") : "RealmSwap Official",
    gameSlug: r.game_slug,
    tags: Array.isArray(r.tags) ? r.tags.join(",") : "",
    downloads: r.download_count ?? 0,
    favorites: r.like_count ?? 0,
    userFavorited: Array.isArray(r.realm_votes) && r.realm_votes.length > 0,
    verifiedLevel: r.verified_level,
    payload: JSON.stringify(r.payload ?? {}),
    customDefSpec: r.custom_def_spec ? JSON.stringify(r.custom_def_spec) : null,
    createdAt: r.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const gameSlug = searchParams.get("game");
    const tag = searchParams.get("tag");
    const verifiedLevel = searchParams.get("verifiedLevel");
    const q = searchParams.get("q") || "";
    const offset = parseInt(searchParams.get("offset") || "0");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const sort = searchParams.get("sort") || "newest"; // "likes" | "downloads" | "newest"

    const supabase = createClient();
    let query = supabase
      .from("realms")
      .select(
        "id, name, description, game_slug, tags, payload, custom_def_spec, download_count, like_count, verified_level, created_at, seller_id, seller:profiles!seller_id(display_name), realm_votes(realm_id)",
      )
      .eq("status", "PUBLISHED");

    if (gameSlug) query = query.eq("game_slug", gameSlug);
    if (tag) query = query.contains("tags", [tag]);
    if (verifiedLevel) query = query.eq("verified_level", verifiedLevel);
    if (q.trim() !== "") {
      // Sanitize before interpolating into a PostgREST or() filter.
      const safeQ = q.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
      if (safeQ) {
        query = query.or(`name.ilike.%${safeQ}%,description.ilike.%${safeQ}%,game_slug.ilike.%${safeQ}%`);
      }
    }

    const col = sort === "likes" ? "like_count" : sort === "downloads" ? "download_count" : "created_at";
    query = query.order(col, { ascending: false }).range(offset, offset + limit); // +1 row => hasMore

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({ results: page.map(mapRealmToTemplate), hasMore });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
