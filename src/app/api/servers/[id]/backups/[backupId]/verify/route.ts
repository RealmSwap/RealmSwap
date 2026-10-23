import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { verifyBackupFile } from "@/lib/backupVerify";

// POST: re-verify a backup archive now (on demand) and record the result.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; backupId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const backup = await prisma.backup.findFirst({
      where: { id: params.backupId, serverId: params.id },
    });
    if (!backup) return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    if (!backup.filePath) {
      return NextResponse.json({ error: "Backup file path is missing" }, { status: 400 });
    }

    const result = verifyBackupFile(backup.filePath, backup.game);
    const updated = await prisma.backup.update({
      where: { id: backup.id },
      data: result.ok
        ? { verifiedAt: new Date(), verifyError: null }
        : { verifiedAt: null, verifyError: result.error ?? "Unknown verification error" },
    });

    return NextResponse.json({
      success: result.ok,
      verifiedAt: updated.verifiedAt,
      error: result.error ?? null,
      entries: result.entries,
      totalBytes: result.totalBytes,
      message: result.ok
        ? `Backup verified — ${result.entries} entries restorable.`
        : `Backup failed verification: ${result.error}`,
    });
  } catch (error: any) {
    console.error("POST /api/servers/[id]/backups/[backupId]/verify error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
