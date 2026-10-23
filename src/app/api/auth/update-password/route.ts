import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sets the new password for the session established by the recovery-email
 * link (/auth/callback exchanged the code for cookies).
 */
export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));

  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "New password is required" }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one from the forgot-password page." },
      { status: 401 }
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
