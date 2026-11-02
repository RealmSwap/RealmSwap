import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["OPEN", "REVIEWED", "DISMISSED", "ACTIONED"] as const;

// PATCH /api/admin/realm-reports/[id]  { status, adminNote? }
//
// Review outcome for a report. RLS (`public.is_admin()`) is the real
// boundary — this route's local role check is a courtesy gate. Realm REMOVAL
// itself is deliberately NOT exposed here: no client flips realm status or
// badges; removal is a maintainer SQL-editor action (see
// docs/marketplace-verification.md).
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await props.params;
    const body = await req.json();
    const status = String(body.status || "").toUpperCase();
    const adminNote = typeof body.adminNote === "string" ? body.adminNote.slice(0, 1000) : null;

    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("realm_reports")
      .update({ status, admin_note: adminNote })
      .eq("id", id)
      .select("id, status")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ error: "Report not found (or your session isn't a cloud admin)" }, { status: 404 });
    }
    return NextResponse.json({ success: true, report: data });
  } catch (error: any) {
    console.error("PATCH realm-report error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
