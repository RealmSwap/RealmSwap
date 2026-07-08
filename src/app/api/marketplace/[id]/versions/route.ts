import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// GET /api/marketplace/[id]/versions — version history for a realm (newest first).
// RLS lets anyone read versions of a realm they can see; payloads are fetched by
// the deploy route, not returned here.
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("realm_versions")
      .select("id, version, changelog, created_at")
      .eq("realm_id", params.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ versions: data ?? [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
