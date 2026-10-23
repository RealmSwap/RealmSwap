import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { readLoaderMarker } from "@/lib/mods/mcLoaders";
import path from "path";

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
      select: { provider: true, packageId: true, name: true, version: true, workshopModId: true }
    });

    if (mods.length === 0) {
      return NextResponse.json({ error: "No mods installed to export." }, { status: 400 });
    }

    // Loader state so a Minecraft collection can recreate the server it came
    // from — jars in mods/ are a silent no-op without it.
    let loader: { type: string; loaderVersion: string; minecraftVersion: string } | null = null;
    if (access.server.game.toUpperCase() === "MINECRAFT") {
      const marker = readLoaderMarker(path.join(dataRoot(), "local-servers", serverId));
      if (marker) {
        loader = { type: marker.type, loaderVersion: marker.loaderVersion, minecraftVersion: marker.minecraftVersion };
      }
    }

    const payload = {
      name: `${access.server.name} Mod Collection`,
      game: access.server.game,
      createdAt: new Date().toISOString(),
      ...(loader ? { loader } : {}),
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
