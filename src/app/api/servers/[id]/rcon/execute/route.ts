import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { rconManager } from "@/lib/rconManager";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    // kick/ban/broadcast are moderation writes — same tier as the console.
    const access = await verifyServerAccess(serverId, user.id, "MODERATOR");
    if (!access) return NextResponse.json({ error: "Server not found or insufficient permissions (Requires MODERATOR)" }, { status: 403 });

    const body = await req.json();
    const { action } = body;
    // Player names and messages are interpolated into RCON command strings,
    // some inside quotes — strip control characters and quote chars so a
    // crafted name can't reshape the command.
    const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[\r\n"'`]/g, "").trim() : "");
    const playerName = clean(body.playerName);
    const message = clean(body.message);

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { game: true, status: true }
    });

    if (!server || server.status !== "RUNNING") {
      return NextResponse.json({ error: "Server is not running" }, { status: 400 });
    }

    let command = "";
    if (server.game.toUpperCase() === "MINECRAFT") {
      if (action === "kick") command = `kick ${playerName}`;
      else if (action === "ban") command = `ban ${playerName}`;
      else if (action === "say") command = `say ${message}`;
    } else if (server.game.toUpperCase() === "PALWORLD") {
      if (action === "kick") command = `KickPlayer ${playerName}`;
      else if (action === "ban") command = `BanPlayer ${playerName}`;
      else if (action === "say") command = `Broadcast ${message}`;
    } else if (server.game.toUpperCase() === "ZOMBOID") {
      if (action === "kick") command = `kickuser "${playerName}"`;
      else if (action === "ban") command = `banid "${playerName}"`;
      else if (action === "say") command = `servermsg "${message}"`;
    }

    if (!command) {
      return NextResponse.json({ error: "Unsupported action for this game" }, { status: 400 });
    }

    const result = await rconManager.execute(serverId, command);
    
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("POST rcon execute error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
