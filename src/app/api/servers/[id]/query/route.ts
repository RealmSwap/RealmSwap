import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { parseSpec } from "@/lib/definitions/serialize";
import { queryGameServer } from "@/lib/serverQuery";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const server = await prisma.server.findUnique({
      where: { id: params.id },
    });

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Only owners or collaborators can query
    const isOwner = server.userId === user.id;
    if (!isOwner) {
      const collab = await prisma.collaborator.findFirst({
        where: { serverId: server.id, userId: user.id },
      });
      if (!collab) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    const record = server.definitionId
      ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
      : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });

    if (!record) {
      return NextResponse.json({ status: "offline", error: "Definition not found" });
    }

    const result = await queryGameServer(server, parseSpec(record.spec));
    if (result.status !== "online") {
      return NextResponse.json({ status: "offline", error: result.error });
    }

    return NextResponse.json({
      status: "online",
      name: result.name,
      players: result.players,
      maxplayers: result.maxplayers,
      playerList: result.playerList,
    });
  } catch (error) {
    console.error("GET /api/servers/[id]/query error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
