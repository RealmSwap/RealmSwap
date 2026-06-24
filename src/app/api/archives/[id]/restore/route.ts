import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { dataRoot } from "@/lib/appPaths";
import fs from "fs";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const archiveId = params.id;

    // Find and verify archive ownership
    const archive = await prisma.archive.findUnique({
      where: { id: archiveId },
    });

    if (!archive || archive.userId !== user.id) {
      return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    }

    // Check if it is a local archive on disk
    const archiveDir = path.join(dataRoot(), "local-archives", archiveId);
    const isLocal = fs.existsSync(archiveDir);

    // Assign game-appropriate RAM defaults for restoration
    let ramAllocation = 4.0;
    let port = 25565;
    if (archive.game === "VALHEIM") { ramAllocation = 6.0; port = 2456; }
    if (archive.game === "ZOMBOID") { ramAllocation = 8.0; port = 16261; }
    if (archive.game === "ARK") { ramAllocation = 12.0; port = 7777; }

    const ipAddress = "127.0.0.1";
    const runnerType = "LOCAL";

    // Restore and delete archive in transaction
    const restoredServer = await prisma.$transaction(async (tx) => {
      // 1. Recreate the active Server record
      const restored = await tx.server.create({
        data: {
          userId: user.id,
          name: archive.serverName,
          game: archive.game,
          ramAllocation,
          region: "US_EAST", // Default restored region
          status: "STOPPED", // Starts stopped so users can toggle it
          runnerType,
          ipAddress,
          port,
          cpuUsage: 0,
          memoryUsage: 0,
        },
      });

      // 2. Delete the archive from the Vault
      await tx.archive.delete({
        where: { id: archiveId },
      });

      // 3. Log activity
      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: "RESTORE_SERVER",
          details: `Restored ${runnerType.toLowerCase()} server '${archive.serverName}' (${archive.game}) from Vault.`,
        },
      });

      return restored;
    });

    // Move filesystem folder for local archives
    if (isLocal) {
      const serverDir = path.join(dataRoot(), "local-servers", restoredServer.id);
      const parentServerDir = path.join(dataRoot(), "local-servers");
      if (!fs.existsSync(parentServerDir)) {
        fs.mkdirSync(parentServerDir, { recursive: true });
      }
      fs.renameSync(archiveDir, serverDir);
    }

    return NextResponse.json(restoredServer);
  } catch (error) {
    console.error("POST /api/archives/[id]/restore error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
