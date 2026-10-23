import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { dataRoot } from "@/lib/appPaths";
import fs from "fs";
import path from "path";

export async function DELETE(
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

    // TODO: Future S3 integration:
    // Call S3 client delete object: s3.deleteObject({ Bucket: "...", Key: `archives/${id}.tar.gz` })

    await prisma.archive.delete({
      where: { id: archiveId },
    });

    // "Permanently deleted" must mean the world data is gone too — without
    // this, every deleted vault world accumulated in local-archives forever.
    const archiveFolder = path.join(dataRoot(), "local-archives", archiveId);
    try {
      if (fs.existsSync(archiveFolder)) {
        fs.rmSync(archiveFolder, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`Archive row deleted but folder removal failed (${archiveFolder}):`, err);
      return NextResponse.json({ success: true, warning: "Archive removed, but its folder could not be deleted from disk." });
    }

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "DELETE_ARCHIVE",
        details: `Permanently deleted archived server '${archive.serverName}' (${archive.game}) from Vault.`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/archives/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
