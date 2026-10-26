import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase email-action landing (PKCE): exchanges the one-time code for a
 * session and forwards to `next` (default /reset-password). A reused or
 * expired code bounces to /login with a message.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") || "/reset-password";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/reset-password";

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("This link is invalid or was already used.")}`, req.url)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("This reset link is invalid or has expired. Request a new one.")}`, req.url)
    );
  }

  return NextResponse.redirect(new URL(safeNext, req.url));
}
