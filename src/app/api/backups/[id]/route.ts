import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { deleteBackup } from "@/lib/backupService";

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backupId = params.id;

    // Verify ownership
    const backup = await prisma.backup.findUnique({
      where: { id: backupId }
    });

    if (!backup || backup.userId !== user.id) {
      return NextResponse.json({ error: "Backup snapshot not found" }, { status: 404 });
    }

    await deleteBackup(backupId);

    return NextResponse.json({ success: true, message: "Backup snapshot deleted successfully" });
  } catch (error: any) {
    console.error("DELETE /api/backups/[id] error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
