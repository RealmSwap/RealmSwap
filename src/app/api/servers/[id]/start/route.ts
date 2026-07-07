import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRunner } from "@/lib/runners";
import { verifyServerAccess } from "@/lib/serverAuth";

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

    // Handle server start via the runner interface
    try {
      const runner = getRunner(server.runnerType);
      
      if (server.autoUpdate && server.game.toUpperCase() !== "MINECRAFT") {
        // Run update then start in background
        (async () => {
          try {
            await runner.update(server, null);
            await runner.start(server, null);
            if (server.tunnelEnabled) {
              const { startTunnel } = await import("@/lib/tunnels");
              startTunnel(server.id, server.port);
            }
          } catch (err) {
            console.error(`Auto-update/start failed for ${server.id}:`, err);
          }
        })();
        
        return NextResponse.json({ ...server, status: "UPDATING" });
      }

      await runner.start(server, null);
      
      const updated = await prisma.server.findUnique({
        where: { id: serverId }
      });
      
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "START_SERVER",
          details: `Started game server '${server.name}' (${server.game}) via ${server.runnerType} runner.`,
        },
      });

      if (server.tunnelEnabled) {
        // dynamic import or just standard import. Let's add import at the top.
        const { startTunnel } = await import("@/lib/tunnels");
        startTunnel(server.id, server.port);
      }

      return NextResponse.json(updated);
    } catch (err: any) {
      await prisma.server.update({
        where: { id: serverId },
        data: { status: "STOPPED", pid: null, cpuUsage: 0, memoryUsage: 0 },
      }).catch(() => {});
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  } catch (error) {
    console.error("POST /api/servers/[id]/start error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
