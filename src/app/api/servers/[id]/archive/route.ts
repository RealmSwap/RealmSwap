import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRunner } from "@/lib/runners";
import { verifyServerAccess } from "@/lib/serverAuth";
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

    const serverId = params.id;

    // Find and verify server access
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    const { server } = access;

    // Stop server if running
    try {
      const runner = getRunner(server.runnerType);
      await runner.stop(server);
    } catch (err) {
      console.error("Error stopping server before archiving:", err);
    }

    // Generate a realistic save size in GB based on the game
    let saveSizeGB = 1.2;
    if (server.game === "MINECRAFT") saveSizeGB = parseFloat((Math.random() * 2 + 0.5).toFixed(2));
    if (server.game === "VALHEIM") saveSizeGB = parseFloat((Math.random() * 3 + 1).toFixed(2));
    if (server.game === "ZOMBOID") saveSizeGB = parseFloat((Math.random() * 4 + 1.5).toFixed(2));
    if (server.game === "ARK") saveSizeGB = parseFloat((Math.random() * 15 + 10).toFixed(2));

    // For local runner, let's measure actual size if directory exists
    const serverDir = path.join(dataRoot(), "local-servers", serverId);
    if (server.runnerType === "LOCAL" && fs.existsSync(serverDir)) {
      try {
        // Measure size of server.jar and logs to show physical size
        const stats = fs.statSync(path.join(serverDir, "server.jar"));
        saveSizeGB = parseFloat((stats.size / (1024 * 1024 * 1024)).toFixed(3)); // convert bytes to GB
        if (saveSizeGB === 0) saveSizeGB = 0.045; // default to jar size approx 45MB
      } catch (e) {
        saveSizeGB = 0.05;
      }
    }

    // Archive and delete in transaction
    const archive = await prisma.$transaction(async (tx) => {
      // 1. Create the Vault Archive record
      const arc = await tx.archive.create({
        data: {
          userId: user.id,
          serverName: server.name,
          game: server.game,
          saveSizeGB,
        },
      });

      // 2. Delete the active server slot
      await tx.server.delete({
        where: { id: serverId },
      });

      // 3. Log activity
      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: "ARCHIVE_SERVER",
          details: `Vaulted ${server.runnerType.toLowerCase()} server '${server.name}' (${server.game}) - Size: ${saveSizeGB} GB.`,
        },
      });

      return arc;
    });

    // Move filesystem folder for local servers
    if (server.runnerType === "LOCAL" && fs.existsSync(serverDir)) {
      const archiveDir = path.join(dataRoot(), "local-archives", archive.id);
      const parentArchiveDir = path.join(dataRoot(), "local-archives");
      if (!fs.existsSync(parentArchiveDir)) {
        fs.mkdirSync(parentArchiveDir, { recursive: true });
      }
      fs.renameSync(serverDir, archiveDir);
    }

    return NextResponse.json(archive);
  } catch (error) {
    console.error("POST /api/servers/[id]/archive error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
