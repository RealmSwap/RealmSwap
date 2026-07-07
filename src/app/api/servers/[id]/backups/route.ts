import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { createBackup } from "@/lib/backupService";
import { verifyServerAccess } from "@/lib/serverAuth";

export async function GET(
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

    const backups = await prisma.backup.findMany({
      where: { serverId },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(backups);
  } catch (error: any) {
    console.error("GET /api/servers/[id]/backups error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

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
    const body = await req.json().catch(() => ({}));
    const { customName } = body;

    // Find and verify server access
    const access = await verifyServerAccess(serverId, user.id, "MODERATOR");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires MODERATOR)" }, { status: 403 });
    }
    const { server } = access;

    // Trigger manual snapshot
    const backup = await createBackup(serverId, "MANUAL", customName);

    return NextResponse.json(backup, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/servers/[id]/backups error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
