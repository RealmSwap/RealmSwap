import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { getRunner } from "@/lib/runners";
import { claimStart, releaseStart } from "@/lib/runners/startClaims";
import { serverEventBus } from "@/lib/eventBus";
import { clearProgress } from "@/lib/downloadProgress";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    // Single-flight: claim before the background chain touches the process,
    // so a Start clicked during a restart gets a clean 409 instead of racing
    // the stop/start sequence.
    if (!claimStart(serverId)) {
      return NextResponse.json({ error: "A start, restart, or update is already in progress for this server." }, { status: 409 });
    }

    const willUpdate = server.autoUpdate && server.game.toUpperCase() !== "MINECRAFT";

    // Run in background so we don't block the request if it takes time.
    // Failures must land in the DB — a swallowed error here used to strand
    // the server on STARTING/UPDATING forever.
    (async () => {
      try {
        const runner = getRunner(server.runnerType);
        await runner.stop(server);

        if (willUpdate) {
          await runner.update(server, null);
        }

        await runner.start(server, null);

        if (server.tunnelEnabled) {
          const { startTunnel } = await import("@/lib/tunnels");
          startTunnel(server.id, server.port).catch((err) =>
            console.error(`[Tunnel] Failed to start for ${serverId}:`, err)
          );
        }
      } catch (err: any) {
        console.error(`Restart failed for ${serverId}:`, err);
        clearProgress(serverId);
        await prisma.server.update({
          where: { id: serverId },
          data: { status: "STOPPED", pid: null, cpuUsage: 0, memoryUsage: 0 },
        }).catch(() => {});
        serverEventBus.emit("status_update", { serverId, status: "STOPPED" });
      } finally {
        releaseStart(serverId);
      }
    })();

    const updatedServer = await prisma.server.update({
      where: { id: serverId },
      data: {
        status: willUpdate ? "UPDATING" : "STARTING",
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
