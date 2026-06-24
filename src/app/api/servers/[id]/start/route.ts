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
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    const { server } = access;

    // Handle server start via the runner interface
    try {
      const runner = getRunner(server.runnerType);
      
      // We pass the full server object to the runner. The definition is resolved inside startLocalServer for LOCAL,
      // but the interface expects it. For now, we can pass null or fetch it.
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
