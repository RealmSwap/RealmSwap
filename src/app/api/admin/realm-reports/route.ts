import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// GET /api/admin/realm-reports
//
// The open report queue for admins. Double-gated: the app checks the LOCAL
// User.role, and cloud RLS (`public.is_admin()`) is the real boundary — a
// non-admin session sees zero rows even if the local gate changes. The app
// never holds a service-role key.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("realm_reports")
      .select(
        "id, realm_id, reason, details, status, admin_note, created_at, realm:realms(name, slug, status), reporter:profiles!reporter_id(display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ reports: data ?? [] });
  } catch (error: any) {
    console.error("GET realm-reports error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
