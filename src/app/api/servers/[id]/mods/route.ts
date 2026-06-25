import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";

// GET /api/servers/[id]/mods
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
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const installedMods = await prisma.modInstallation.findMany({
      where: { serverId },
      orderBy: { installedAt: "desc" }
    });

    return NextResponse.json({ mods: installedMods });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/mods error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
