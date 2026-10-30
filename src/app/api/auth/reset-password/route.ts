import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Sends the Supabase recovery email. The response is identical whether or not
 * the address has an account — existence never leaks through this endpoint.
 *
 * The email link lands on /auth/callback (PKCE exchange → session), which
 * forwards to /reset-password where the new password is set. The redirect URL
 * is derived from the request origin, so dev (localhost:3000) and the desktop
 * app (127.0.0.1:<port>) work — the origin must be allowlisted in the
 * Supabase project's redirect URLs.
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Reset-email spam (each request sends real mail) is limited per-IP before
  // it reaches Supabase.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!checkRateLimit(`auth_reset_${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json(
      { error: "Too many reset emails requested. Please try again later." },
      { status: 429 }
    );
  }

  const origin = req.nextUrl.origin;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(String(email).toLowerCase(), {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error("resetPasswordForEmail failed:", error.message);
    if (/rate limit/i.test(error.message)) {
      return NextResponse.json(
        { error: "Too many reset emails have been requested — please wait a while and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "Could not send the reset email right now. Please try again." }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    message:
      "If an account exists for that address, a password reset link is on its way. Check your inbox (and spam folder). The link opens RealmSwap, where you can set a new password.",
  });
}
