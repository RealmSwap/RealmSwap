import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { getRunner } from "@/lib/runners";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;

    // Find and verify server access
    const access = await verifyServerAccess(serverId, user.id, "MODERATOR");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires MODERATOR)" }, { status: 403 });
    }
    const { server } = access;

    // Run in background so we don't block the request if it takes time
    (async () => {
      try {
        const runner = getRunner(server.runnerType);
        await runner.stop(server);
        
        if (server.autoUpdate && server.game.toUpperCase() !== "MINECRAFT") {
           await runner.update(server, null);
        }

        await runner.start(server, null);

        if (server.tunnelEnabled) {
          const { startTunnel } = await import("@/lib/tunnels");
          startTunnel(server.id, server.port);
        }
      } catch (err) {
        console.error(`Restart failed for ${serverId}:`, err);
      }
    })();

    const updatedServer = await prisma.server.update({
      where: { id: serverId },
      data: {
        status: server.autoUpdate && server.game.toUpperCase() !== "MINECRAFT" ? "UPDATING" : "STARTING",
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTART_SERVER",
        details: `Restarted game server '${server.name}' (${server.game}).`,
      },
    });

    return NextResponse.json(updatedServer);
  } catch (error) {
    console.error("POST /api/servers/[id]/restart error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
