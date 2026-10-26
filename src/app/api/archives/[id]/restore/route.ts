import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { dataRoot } from "@/lib/appPaths";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    if (!fs.existsSync(archiveDir)) {
      // An archive row without a folder is already stranded data — creating
      // an empty server would mask the loss behind a "successful" restore.
      return NextResponse.json({
        error: "Archive folder is missing on disk — the vaulted world data could not be found. Nothing was changed.",
      }, { status: 500 });
    }

    // Assign game-appropriate RAM defaults for restoration
    let ramAllocation = 4.0;
    let port = 25565;
    if (archive.game === "VALHEIM") { ramAllocation = 6.0; port = 2456; }
    if (archive.game === "ZOMBOID") { ramAllocation = 8.0; port = 16261; }
    if (archive.game === "ARK") { ramAllocation = 12.0; port = 7777; }

    const ipAddress = "127.0.0.1";
    const runnerType = "LOCAL";

    // 1. Create the server row first (stopped). If anything after this
    // fails, the row is deleted again — the world folder is only moved once
    // the row exists to receive it, so a rename failure can never strand
    // data with no DB row pointing at it.
    let restoredServer;
    try {
      restoredServer = await prisma.server.create({
        data: {
          userId: user.id,
          name: archive.serverName,
          game: archive.game,
          ramAllocation,
          region: "LOCALHOST",
          status: "STOPPED", // Starts stopped so users can toggle it
          runnerType,
          ipAddress,
          port,
          cpuUsage: 0,
          memoryUsage: 0,
        },
      });
    } catch (err) {
      console.error("Vault restore: server row creation failed:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const serverDir = path.join(dataRoot(), "local-servers", restoredServer.id);
    const parentServerDir = path.join(dataRoot(), "local-servers");
    if (!fs.existsSync(parentServerDir)) {
      fs.mkdirSync(parentServerDir, { recursive: true });
    }
    try {
      fs.renameSync(archiveDir, serverDir);
    } catch (err) {
      // Folder move failed — remove the just-created row so the archive
      // stays fully intact and the user can retry.
      await prisma.server.delete({ where: { id: restoredServer.id } }).catch(() => {});
      console.error("Vault restore: folder move failed:", err);
      return NextResponse.json({ error: "Failed to move the archived world into place — nothing was changed." }, { status: 500 });
    }

    // 2. The world is in place under its new server row; retire the archive
    // row and log. (If the process dies between the move and this delete,
    // the vault lists an archive whose folder is gone — retrying fails
    // loudly at the existsSync check instead of silently restoring nothing.)
    await prisma.archive.delete({
      where: { id: archiveId },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTORE_SERVER",
        details: `Restored ${runnerType.toLowerCase()} server '${archive.serverName}' (${archive.game}) from Vault.`,
      },
    });

    return NextResponse.json(restoredServer);
  } catch (error) {
    console.error("POST /api/archives/[id]/restore error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
