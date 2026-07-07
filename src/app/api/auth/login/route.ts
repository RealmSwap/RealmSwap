import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { ensureLocalUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).toLowerCase(),
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // signInWithPassword set the session cookies via the ssr client. Sync the
    // local mirror so downstream code (getAuthenticatedUser + local FKs) works.
    const user = await ensureLocalUser(data.user);

    await prisma.activityLog
      .create({
        data: {
          userId: data.user.id,
          action: "USER_LOGIN",
          details: "User successfully logged in via Supabase Auth.",
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      user: { id: data.user.id, email: user?.email, name: user?.name },
    });
  } catch (error) {
    console.error("Login API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
