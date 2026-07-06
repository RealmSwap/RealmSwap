import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { discordId } = body;

    // Optional: add validation here if needed

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        discordId: discordId ? discordId.trim() : null,
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error: any) {
    console.error("Failed to update settings:", error);
    if (error.code === 'P2002') {
        return NextResponse.json({ error: "That Discord ID is already linked to another account." }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
