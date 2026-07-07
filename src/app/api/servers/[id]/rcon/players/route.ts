import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { rconManager } from "@/lib/rconManager";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    // Fetch the server game
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { game: true, status: true }
    });

    if (!server || server.status !== "RUNNING") {
      return NextResponse.json({ players: [] });
    }

    const players = await rconManager.getPlayers(serverId, server.game);

    return NextResponse.json({ players });
  } catch (error: any) {
    console.error("GET rcon players error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
