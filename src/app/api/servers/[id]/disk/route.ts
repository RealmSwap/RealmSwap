import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { getServerDiskBytes, bytesToGB } from "@/lib/diskUsage";
import { getFreeDiskSpaceGB } from "@/lib/preflight";
import { dataRoot } from "@/lib/appPaths";
import path from "path";

// GET: real numbers for the hero card's Disk tile — the server folder's size
// on the host plus free space on the drive that holds it, and the recent
// disk-size history the telemetry table has been stamping (real sparkline).
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions" }, { status: 403 });
    }

    const folderBytes = await getServerDiskBytes(params.id, { awaitFresh: true });
    // Free space is meaningful only when the server actually has a local
    // folder — otherwise it would describe the host, not the server.
    const freeGB = folderBytes === null ? null : await getFreeDiskSpaceGB(path.join(dataRoot(), "local-servers", params.id));

    const historyRows = await prisma.serverTelemetry.findMany({
      where: { serverId: params.id, diskMB: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 72,
      select: { diskMB: true },
    });
    // Rows are stamped every tick but the walk refreshes every ~5 min —
    // collapse consecutive duplicates so the sparkline shows real steps.
    const history: number[] = [];
    for (const row of historyRows.reverse()) {
      const v = row.diskMB as number;
      if (history.length === 0 || Math.abs(history[history.length - 1] - v) > 0.001) {
        history.push(v);
      }
    }

    return NextResponse.json({
      folderGB: bytesToGB(folderBytes),
      freeGB: freeGB === null || freeGB > 9000 ? null : Math.round(freeGB * 10) / 10,
      history,
    });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/disk error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
