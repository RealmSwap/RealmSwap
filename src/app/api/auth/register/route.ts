import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { ensureLocalUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 },
      );
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: String(email).toLowerCase(),
      password,
      options: { data: { full_name: name } },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data.user) {
      return NextResponse.json(
        { error: "Could not create account. Please try again." },
        { status: 400 },
      );
    }

    // With email confirmations enabled there is no session yet — the desktop
    // flow expects instant sign-in, so surface a clear message. (Disable
    // "Confirm email" in Supabase Auth settings for the baseline.)
    if (!data.session) {
      return NextResponse.json(
        {
          error:
            "Check your email to confirm your account before signing in. (Admins: disable 'Confirm email' in Supabase Auth for instant sign-in.)",
        },
        { status: 400 },
      );
    }

    const user = await ensureLocalUser(data.user);

    await prisma.activityLog
      .create({
        data: {
          userId: data.user.id,
          action: "USER_REGISTER",
          details: "Registered account via Supabase Auth.",
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      user: { id: data.user.id, email: user?.email, name: user?.name },
    });
  } catch (error) {
    console.error("Register API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
