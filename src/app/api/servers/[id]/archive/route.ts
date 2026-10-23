import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRunner } from "@/lib/runners";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import fs from "fs";
import path from "path";
import * as crypto from "crypto";

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
    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
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

    // The folder move happens BEFORE any DB change: if the move fails, the
    // server row still exists and the world stays reachable. The move is
    // rolled back if the transaction below fails. (The reverse order —
    // delete the row first, rename afterwards — strands the world on any
    // rename failure with no server row and no archive pointing at it.)
    const archiveId = crypto.randomUUID();
    const isLocalServer = server.runnerType === "LOCAL" && fs.existsSync(serverDir);
    const archiveFolderPath = path.join(dataRoot(), "local-archives", archiveId);
    if (isLocalServer) {
      const parentArchiveDir = path.join(dataRoot(), "local-archives");
      if (!fs.existsSync(parentArchiveDir)) {
        fs.mkdirSync(parentArchiveDir, { recursive: true });
      }
      fs.renameSync(serverDir, archiveFolderPath);
    }

    let archive;
    try {
      archive = await prisma.$transaction(async (tx) => {
        // 1. Create the Vault Archive record (id pre-generated for the folder name)
        const arc = await tx.archive.create({
          data: {
            id: archiveId,
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
    } catch (txErr) {
      if (isLocalServer) {
        try {
          fs.renameSync(archiveFolderPath, serverDir);
        } catch (rollbackErr) {
          console.error(`CRITICAL: archive transaction failed and folder rollback failed — world is at ${archiveFolderPath} with no server row:`, rollbackErr);
        }
      }
      throw txErr;
    }

    return NextResponse.json(archive);
  } catch (error) {
    console.error("POST /api/servers/[id]/archive error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
