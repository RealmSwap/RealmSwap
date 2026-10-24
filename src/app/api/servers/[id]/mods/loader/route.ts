import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import {
  detectMinecraftVersion, installFabricServer, installForgeServer, installNeoForgeServer,
  installQuiltServer, readLoaderMarker,
} from "@/lib/mods/mcLoaders";
import path from "path";
import { requireLocalServer } from "@/lib/agents/perimeter";

const LOADER_LABELS: Record<string, string> = {
  fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge",
};

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

// POST: install a mod loader (Fabric, Forge, or NeoForge) on a Minecraft server.
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
    requireLocalServer(server, "Mod loader installs");
    const serverId = server.id;

    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Mod loaders are only supported for Minecraft servers." }, { status: 400 });
    }
    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before installing a mod loader." }, { status: 400 });
    }

    const bodySchema = z.object({ loader: z.enum(["fabric", "quilt", "forge", "neoforge"]) });
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    const loaderName = LOADER_LABELS[parsed.data.loader];

    const installDir = path.join(dataRoot(), "local-servers", serverId);
    const minecraftVersion = detectMinecraftVersion(installDir);
    if (!minecraftVersion) {
      return NextResponse.json(
        { error: "Couldn't read the server's Minecraft version — install/start the server once first." },
        { status: 400 }
      );
    }

    // Switching loaders means removing the old one's files — restore a
    // pre-loader snapshot instead of layering loaders on top of each other.
    const existing = readLoaderMarker(installDir);
    if (existing && existing.type !== parsed.data.loader) {
      return NextResponse.json(
        { error: `This server already runs the ${LOADER_LABELS[existing.type]} loader. To switch loaders, restore a snapshot from before it was installed (Backups), then install ${loaderName}.` },
        { status: 400 }
      );
    }

    const snapshot = await createSnapshot(serverId, user.id, `Pre-install: ${loaderName} loader`);
    try {
      const onLog = (msg: string) => console.log(`[Loader ${serverId}] ${msg}`);
      let marker;
      if (parsed.data.loader === "forge") {
        marker = await installForgeServer(installDir, minecraftVersion, { onLog });
      } else if (parsed.data.loader === "neoforge") {
        marker = await installNeoForgeServer(installDir, minecraftVersion, { onLog });
      } else if (parsed.data.loader === "quilt") {
        marker = await installQuiltServer(installDir, minecraftVersion, { onLog });
      } else {
        marker = await installFabricServer(installDir, minecraftVersion, onLog);
      }
      await testServerBoot(serverId, "MINECRAFT");

      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "INSTALL_MOD",
          details: `Installed ${loaderName} ${marker.loaderVersion} loader (Minecraft ${minecraftVersion}) on server '${server.name}'.`,
        },
      });

      return NextResponse.json({
        success: true,
        loader: marker,
        message: `${loaderName} ${marker.loaderVersion} installed. The server now loads jars from mods/.`,
      });
    } catch (err: any) {
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);
      return NextResponse.json({
        error: `Loader installation failed and was rolled back. Cause: ${err.message}`,
        ...(err instanceof SandboxBootError ? { bootOutput: err.output } : {}),
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/loader error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
