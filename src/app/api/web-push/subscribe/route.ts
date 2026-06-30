import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscription = await req.json();

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
    }

    // Check if subscription already exists to avoid duplicates
    const existing = await prisma.pushSubscription.findFirst({
      where: { endpoint: subscription.endpoint, userId: user.id }
    });

    if (existing) {
      return NextResponse.json({ success: true, message: "Subscription already exists" });
    }

    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Web Push Subscribe Error:", err);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}
