import { NextResponse } from "next/server";
import { DOWNLOAD_URL, sanitizeRef } from "@/lib/constants";
import { getPublicSupabaseClient } from "@/lib/backend/supabase";

// GET /download?ref=<surface>&realm=<slug>
//
// Which marketing surface installs come from, answered with as little data as
// possible: one row per click carrying only the surface token, the realm slug
// when there is one, and the day. No cookies, no IPs, no user ids; the table
// is insert-only for the public (no read policy), and a failed count never
// blocks the download — this handler's only real job is the redirect.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ref = sanitizeRef(url.searchParams.get("ref") ?? "");
  const realm = url.searchParams.get("realm") ? sanitizeRef(url.searchParams.get("realm")!) : null;
  try {
    const supabase = getPublicSupabaseClient();
    if (supabase) {
      await supabase.from("download_clicks").insert({ source: ref, realm_slug: realm });
    }
  } catch {
    // counting is best-effort
  }
  return NextResponse.redirect(DOWNLOAD_URL, 302);
}
