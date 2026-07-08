import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Toggle the caller's favorite (heart) on a realm. A favorite is a realm_votes
// row (value fixed at 1); un-favoriting deletes it. The counter trigger keeps
// realms.like_count in sync, which the app surfaces as the favorite count.
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { favorited } = await request.json();
    const realmId = params.id;
    const supabase = createClient();

    if (favorited) {
      const { error } = await supabase
        .from("realm_votes")
        .upsert({ realm_id: realmId, user_id: user.id, value: 1 }, { onConflict: "realm_id,user_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase
        .from("realm_votes")
        .delete()
        .eq("realm_id", realmId)
        .eq("user_id", user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
