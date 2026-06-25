import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const mods = await prisma.modInstallation.findMany({
      where: { serverId },
      select: { provider: true, packageId: true, name: true }
    });

    if (mods.length === 0) {
      return NextResponse.json({ error: "No mods installed to export." }, { status: 400 });
    }

    const payload = {
      name: `${access.server.name} Mod Collection`,
      game: access.server.game,
      createdAt: new Date().toISOString(),
      mods: mods
    };

    // Return as a downloadable JSON file
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${access.server.game.toLowerCase()}-collection.json"`
      }
    });

  } catch (error: any) {
    console.error("GET export mod collection error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
