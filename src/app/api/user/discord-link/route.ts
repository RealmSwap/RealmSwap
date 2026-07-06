import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Find valid code
    const linkCode = await prisma.discordLinkCode.findUnique({
      where: { code }
    });

    if (!linkCode) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    if (linkCode.expiresAt < new Date()) {
      await prisma.discordLinkCode.delete({ where: { id: linkCode.id } });
      return NextResponse.json({ error: "Code has expired" }, { status: 400 });
    }

    // Link the discordId
    await prisma.user.update({
      where: { id: user.id },
      data: { discordId: linkCode.discordId }
    });

    // Delete the used code
    await prisma.discordLinkCode.delete({ where: { id: linkCode.id } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Failed to link Discord account" }, { status: 500 });
  }
}
