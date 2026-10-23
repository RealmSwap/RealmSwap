import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { createSnapshot, restoreSnapshot } from "@/lib/snapshots";
import { testServerBoot } from "@/lib/runners/sandbox";
import { detectMinecraftVersion, installFabricServer, readLoaderMarker } from "@/lib/mods/mcLoaders";
import path from "path";

// GET: current loader state for the Mod Manager UI.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    if (access.server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ supported: false, loader: null });
    }
    const loader = readLoaderMarker(path.join(dataRoot(), "local-servers", params.id));
    return NextResponse.json({ supported: true, loader });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/mods/loader error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST: install a mod loader on a Minecraft server (Fabric supported;
// Forge deliberately refused until its installer flow is built).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;
    const serverId = server.id;

    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Mod loaders are only supported for Minecraft servers." }, { status: 400 });
    }
    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before installing a mod loader." }, { status: 400 });
    }

    const bodySchema = z.object({ loader: z.enum(["fabric", "forge"]) });
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    if (parsed.data.loader === "forge") {
      return NextResponse.json(
        { error: "Forge server installation isn't supported yet — coming soon. Fabric works today." },
        { status: 400 }
      );
    }

    const installDir = path.join(dataRoot(), "local-servers", serverId);
    const minecraftVersion = detectMinecraftVersion(installDir);
    if (!minecraftVersion) {
      return NextResponse.json(
        { error: "Couldn't read the server's Minecraft version — install/start the server once first." },
        { status: 400 }
      );
    }

    const snapshot = await createSnapshot(serverId, user.id, "Pre-install: Fabric loader");
    try {
      const marker = await installFabricServer(installDir, minecraftVersion);
      await testServerBoot(serverId, "MINECRAFT");

      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "INSTALL_MOD",
          details: `Installed Fabric ${marker.loaderVersion} loader (Minecraft ${minecraftVersion}) on server '${server.name}'.`,
        },
      });

      return NextResponse.json({
        success: true,
        loader: marker,
        message: `Fabric ${marker.loaderVersion} installed. The server now loads jars from mods/.`,
      });
    } catch (err: any) {
      await restoreSnapshot(snapshot.id);
      await prisma.serverSnapshot.delete({ where: { id: snapshot.id } });
      return NextResponse.json({
        error: `Loader installation failed and was rolled back. Cause: ${err.message}`,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/loader error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
