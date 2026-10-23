import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
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
    const { snapshotInterval } = await req.json();

    if (snapshotInterval === undefined) {
      return NextResponse.json({ error: "snapshotInterval is required" }, { status: 400 });
    }

    const intervalVal = parseInt(snapshotInterval, 10);
    if (isNaN(intervalVal) || ![0, 1, 6, 12, 24].includes(intervalVal)) {
      return NextResponse.json({ error: "Invalid snapshot interval value" }, { status: 400 });
    }

    // Find and verify server access
    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;

    const updatedServer = await prisma.server.update({
      where: { id: serverId },
      data: {
        snapshotInterval: intervalVal,
        lastSnapshotAt: intervalVal === 0 ? null : server.lastSnapshotAt
      }
    });

    // Write Activity Log
    const intervalNames: Record<number, string> = {
      0: "Disabled",
      1: "Every Hour",
      6: "Every 6 Hours",
      12: "Every 12 Hours",
      24: "Daily"
    };

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTORE_SERVER",
        details: `Configured automated backups schedule for server '${server.name}' to: ${intervalNames[intervalVal] || intervalVal}.`
      }
    });

    return NextResponse.json(updatedServer);
  } catch (error: any) {
    console.error("POST /api/servers/[id]/backups/settings error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
