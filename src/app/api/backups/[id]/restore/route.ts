import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { restoreBackup } from "@/lib/backupService";
import { downloadOffsiteBackup } from "@/lib/offsiteBackup";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backupId = params.id;
    const body = await req.json().catch(() => ({}));
    const fromOffsite = body?.offsite === true;

    // Verify ownership
    const backup = await prisma.backup.findUnique({
      where: { id: backupId }
    });

    if (!backup || backup.userId !== user.id) {
      return NextResponse.json({ error: "Backup snapshot not found" }, { status: 404 });
    }

    // Restore from the offsite copy when the local file is gone — the
    // disk-died scenario offsite backups exist for.
    let sourcePath: string | undefined;
    let tempDir: string | null = null;
    if (fromOffsite) {
      if (backup.offsiteStatus !== "UPLOADED") {
        return NextResponse.json({ error: "This backup has no offsite copy to restore from" }, { status: 400 });
      }
      sourcePath = await downloadOffsiteBackup(backupId);
      tempDir = path.dirname(sourcePath);
    }

    try {
      // Call restore logic
      await restoreBackup(backupId, sourcePath);
    } finally {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }

    return NextResponse.json({ success: true, message: "Backup snapshot restored successfully" });
  } catch (error: any) {
    console.error("POST /api/backups/[id]/restore error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
