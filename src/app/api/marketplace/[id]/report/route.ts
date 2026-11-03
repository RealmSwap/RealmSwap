import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const REASONS = ["INAPPROPRIATE", "MALICIOUS", "SPAM", "BROKEN", "COPYRIGHT", "OTHER"] as const;

// POST /api/marketplace/[id]/report  { reason, details? }
//
// Community reporting for a marketplace realm. One report per (realm, user) —
// the unique constraint turns double submits into a friendly message. RLS on
// realm_reports forces reporter_id to the caller; inserted through the user's
// own session, never a privileged client.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: realmId } = await props.params;
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason || "").toUpperCase();
    const details = typeof body.details === "string" ? body.details.slice(0, 1000) : null;

    if (!REASONS.includes(reason as (typeof REASONS)[number])) {
      return NextResponse.json({ error: "Pick a report reason." }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.from("realm_reports").insert({
      realm_id: realmId,
      reporter_id: user.id,
      reason,
      details,
    });

    if (error) {
      // 23505 = unique_violation on (realm_id, reporter_id).
      if (error.code === "23505") {
        return NextResponse.json({ error: "You've already reported this realm — thanks." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: "Report sent. Thank you." });
  } catch (error: any) {
    console.error("POST realm report error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
