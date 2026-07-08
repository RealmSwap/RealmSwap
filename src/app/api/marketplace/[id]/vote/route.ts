import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type } = await request.json(); // "LIKE" | "DISLIKE" | "NONE"
    const realmId = params.id;
    const supabase = createClient();

    // user.id is the Supabase uid (local mirror), so it satisfies the RLS check
    // user_id = auth.uid(). The realm_votes counter trigger keeps like/dislike counts.
    if (type === "NONE") {
      const { error } = await supabase
        .from("realm_votes")
        .delete()
        .eq("realm_id", realmId)
        .eq("user_id", user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (type !== "LIKE" && type !== "DISLIKE") {
      return NextResponse.json({ error: "Invalid vote type" }, { status: 400 });
    }

    const { error } = await supabase
      .from("realm_votes")
      .upsert(
        { realm_id: realmId, user_id: user.id, value: type === "LIKE" ? 1 : -1 },
        { onConflict: "realm_id,user_id" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
