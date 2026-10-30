import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRunner } from "@/lib/runners";
import { verifyServerAccess } from "@/lib/serverAuth";
import { localProcesses } from "@/lib/runners/LocalRunner";
import { claimStart, releaseStart } from "@/lib/runners/startClaims";
import { serverEventBus } from "@/lib/eventBus";
import { clearProgress } from "@/lib/downloadProgress";

const BUSY_STATUSES = ["RUNNING", "STARTING", "UPDATING"];

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

    // Single-flight: claim the server before anything async happens. Two
    // quick Start clicks used to both pass the checks and each spawn a game
    // process fighting over the same world files and port.
    if (!claimStart(serverId)) {
      return NextResponse.json({ error: "A start, restart, or update is already in progress for this server." }, { status: 409 });
    }

    // The background auto-update chain takes ownership of the claim and
    // releases it in its own finally; the synchronous paths release in the
    // outer finally below.
    let backgroundOwnsClaim = false;

    try {
      if (BUSY_STATUSES.includes(server.status) || localProcesses.has(serverId)) {
        return NextResponse.json({ error: "Server is already running or starting." }, { status: 409 });
      }

      const runner = getRunner(server.runnerType);

      if (server.autoUpdate && server.game.toUpperCase() !== "MINECRAFT") {
        // Run update then start in background. Failures must land in the DB —
        // a swallowed error here used to strand the server on UPDATING forever
        // with a restart button that did nothing.
        backgroundOwnsClaim = true;
        (async () => {
          try {
            await runner.update(server, null);
            await runner.start(server, null);
            if (server.tunnelEnabled) {
              const { startTunnel } = await import("@/lib/tunnels");
              const tunnelResult = await startTunnel(server.id, server.port);
              if (!tunnelResult.ok) console.error(`[Tunnel] Auto-start after update failed for ${server.id}: ${tunnelResult.error}`);
            }
          } catch (err: any) {
            console.error(`Auto-update/start failed for ${server.id}:`, err);
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

        return NextResponse.json({ ...server, status: "UPDATING" });
      }

      try {
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
          const { startTunnel } = await import("@/lib/tunnels");
          // A tunnel failure must not fail the start request for a server
          // that is already running.
          const tunnelResult = await startTunnel(server.id, server.port).catch((err) => {
            console.error(`[Tunnel] Failed to start for ${server.id}:`, err);
            return { ok: false as const, error: String(err) };
          });
          if (!tunnelResult.ok) {
            console.error(`[Tunnel] Failed to start for ${server.id}: ${tunnelResult.error}`);
          }
        }

        return NextResponse.json(updated);
      } catch (err: any) {
        await prisma.server.update({
          where: { id: serverId },
          data: { status: "STOPPED", pid: null, cpuUsage: 0, memoryUsage: 0 },
        }).catch(() => {});
        serverEventBus.emit("status_update", { serverId, status: "STOPPED" });
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    } finally {
      if (!backgroundOwnsClaim) releaseStart(serverId);
    }
  } catch (error) {
    console.error("POST /api/servers/[id]/start error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
