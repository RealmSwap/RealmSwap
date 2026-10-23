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

    // discordId is intentionally NOT writable here: User.discordId is what
    // the Discord bot resolves accounts by, so a raw write would let anyone
    // squat another person's identity (and block their real link). The only
    // path is the bot's /link code flow -> /api/user/discord-link.
    if ("discordId" in body) {
      return NextResponse.json(
        { error: "Discord can only be linked via the bot: type /link in Discord and enter the code here." },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {},
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
