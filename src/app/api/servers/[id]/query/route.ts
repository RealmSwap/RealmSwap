import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { parseSpec } from "@/lib/definitions/serialize";
import { DefinitionContext } from "@/lib/definitions/types";
import { renderTemplate } from "@/lib/definitions/template";
import { GameDig } from "gamedig";

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

    // Must be running to query
    if (server.status !== "RUNNING") {
      return NextResponse.json({ status: "offline", error: "Server is not running" });
    }

    let record = server.definitionId 
      ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
      : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });

    if (!record) {
      return NextResponse.json({ status: "offline", error: "Definition not found" });
    }

    const spec = parseSpec(record.spec);

    if (!spec.queryType) {
      return NextResponse.json({ status: "offline", error: "Query protocol not supported for this game" });
    }

    const paramValues = typeof server.paramValues === "string" ? JSON.parse(server.paramValues) : {};
    const ctx: DefinitionContext = {
      name: server.name,
      nameSanitized: server.name.replace(/[^a-zA-Z0-9]/g, "_"),
      password: server.password || "",
      port: server.port,
      ram: server.ramAllocation,
      ...paramValues,
    };

    let queryPort = server.port;
    if (spec.queryPort) {
      queryPort = parseInt(renderTemplate(spec.queryPort, ctx), 10);
    }

    try {
      const state = await GameDig.query({
        type: spec.queryType as any,
        host: "127.0.0.1",
        port: queryPort,
      });

      return NextResponse.json({
        status: "online",
        name: state.name,
        players: state.players.length,
        maxplayers: state.maxplayers,
        playerList: state.players,
      });
    } catch (e: any) {
      return NextResponse.json({ status: "offline", error: e.message || "Query failed" });
    }
  } catch (error) {
    console.error("GET /api/servers/[id]/query error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
