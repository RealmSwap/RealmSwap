import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// GET /api/marketplace/mine?game=SLUG — the caller's own realms (for the publish
// "update an existing realm" picker). RLS scopes reads to the seller.
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const game = new URL(request.url).searchParams.get("game");
    const supabase = createClient();
    let query = supabase
      .from("realms")
      .select("id, name, version, game_slug")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    if (game) query = query.eq("game_slug", game);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ realms: data ?? [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
