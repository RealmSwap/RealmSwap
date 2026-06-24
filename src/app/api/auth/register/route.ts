import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, plan = "FREE" } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists with this email" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = hashPassword(password);

    // Give unlimited active slots for local hosting
    let activeSlots = 999;

    // Create user and subscription in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const userCount = await tx.user.count();
      const role = userCount === 0 ? "ADMIN" : "USER";

      const user = await tx.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          passwordHash: hashedPassword,
          role,
        },
      });

      const subscription = await tx.subscription.create({
        data: {
          userId: user.id,
          plan,
          status: "ACTIVE",
          activeSlots,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: "USER_REGISTER",
          details: `Registered account and selected ${plan} plan (${activeSlots} server slot(s)).`,
        },
      });

      return { user, subscription };
    });

    // Sign JWT and set cookie
    const token = signToken(result.user.id);
    const response = NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
    });

    response.cookies.set("gv_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Register API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
