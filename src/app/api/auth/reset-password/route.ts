import { NextRequest, NextResponse } from "next/server";

/**
 * Password reset is owned by Supabase Auth. Wiring the email flow
 * (`supabase.auth.resetPasswordForEmail`) requires SMTP configured in the
 * Supabase project — a go-live item. Until then this is a neutral stub that does
 * not reveal whether an email exists.
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message:
      "Password reset is coming soon. If you're locked out, please contact support.",
  });
}
