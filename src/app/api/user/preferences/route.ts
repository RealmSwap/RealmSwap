import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { notifyDiscord, notifyEmail, notifyWebPush } = await req.json();

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        notifyDiscord: notifyDiscord !== undefined ? notifyDiscord : undefined,
        notifyEmail: notifyEmail !== undefined ? notifyEmail : undefined,
        notifyWebPush: notifyWebPush !== undefined ? notifyWebPush : undefined,
      }
    });

    return NextResponse.json({
      success: true,
      preferences: {
        notifyDiscord: updatedUser.notifyDiscord,
        notifyEmail: updatedUser.notifyEmail,
        notifyWebPush: updatedUser.notifyWebPush
      }
    });
  } catch (err) {
    console.error("Update Preferences Error:", err);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}
