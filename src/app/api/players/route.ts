import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const players = await prisma.player.findMany({
      where: { userId: user.id },
      include: {
        serverAccess: {
          include: { server: { select: { id: true, name: true, game: true } } }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(players);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = await req.json();
    if (!data.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const player = await prisma.player.create({
      data: {
        userId: user.id,
        name: data.name,
        steamId: data.steamId,
        xboxId: data.xboxId,
        minecraftUuid: data.minecraftUuid,
        discordId: data.discordId,
        status: data.status || "TRUSTED",
        roles: data.roles
      }
    });

    return NextResponse.json(player);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
