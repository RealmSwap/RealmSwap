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
import { installTmlLoader } from "@/lib/mods/installers";
import { tmlInstallDir, readTmlMarker } from "@/lib/mods/tml";
import fs from "fs";
import path from "path";
import { requireLocalServer } from "@/lib/agents/perimeter";

const LOADER_LABELS: Record<string, string> = {
  fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge",
  tmodloader: "tModLoader",
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

    const game = access.server.game.toUpperCase();
    const installDir = path.join(dataRoot(), "local-servers", params.id);
    if (game === "MINECRAFT") {
      return NextResponse.json({ supported: true, loader: readLoaderMarker(installDir) });
    }
    if (game === "TERRARIA") {
      return NextResponse.json({ supported: true, loader: readTmlMarker(tmlInstallDir(installDir)) });
    }
    return NextResponse.json({ supported: false, loader: null });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/mods/loader error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST: install a mod loader — a Java loader (Fabric/Quilt/Forge/NeoForge) on
// a Minecraft server, or tModLoader on a Terraria server.
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
    const game = server.game.toUpperCase();

    if (game !== "MINECRAFT" && game !== "TERRARIA") {
      return NextResponse.json({ error: "Mod loaders are only supported for Minecraft and Terraria servers." }, { status: 400 });
    }
    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before installing a mod loader." }, { status: 400 });
    }

    const bodySchema = z.object({
      loader: z.enum(["fabric", "quilt", "forge", "neoforge", "tmodloader"]),
    });
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    if (game === "TERRARIA") {
      if (parsed.data.loader !== "tmodloader") {
        return NextResponse.json({ error: "Only the tModLoader loader is supported on Terraria servers." }, { status: 400 });
      }
      return await installTerrariaLoader(server, serverId, user.id);
    }
    if (parsed.data.loader === "tmodloader") {
      return NextResponse.json({ error: "tModLoader is a Terraria loader — pick fabric/quilt/forge/neoforge." }, { status: 400 });
    }

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

// Terraria: install the tModLoader dedicated server beside the vanilla one.
// The vanilla install must exist first — the world stays in its worlds/ folder
// (the tML launch points -world back there), so both runtimes share one world.
async function installTerrariaLoader(server: { id: string; name: string }, serverId: string, userId: string) {
  const serverRoot = path.join(dataRoot(), "local-servers", serverId);
  if (!fs.existsSync(path.join(serverRoot, "terraria-server", "TerrariaServer.exe"))) {
    return NextResponse.json(
      { error: "The vanilla Terraria server isn't installed yet — start the server once first." },
      { status: 400 }
    );
  }
  if (readTmlMarker(tmlInstallDir(serverRoot))) {
    return NextResponse.json(
      { error: "tModLoader is already installed. To remove it, restore a snapshot from before it was installed (Backups)." },
      { status: 400 }
    );
  }

  const snapshot = await createSnapshot(serverId, userId, "Pre-install: tModLoader");
  try {
    const onLog = (msg: string) => console.log(`[Loader ${serverId}] ${msg}`);
    await installTmlLoader({ serverRoot, onLog });
    await testServerBoot(serverId, "TERRARIA");

    await prisma.activityLog.create({
      data: {
        userId,
        action: "INSTALL_MOD",
        details: `Installed tModLoader (Steam app 1281930) on server '${server.name}'.`,
      },
    });

    return NextResponse.json({
      success: true,
      loader: readTmlMarker(tmlInstallDir(serverRoot)),
      message: "tModLoader installed. The server now boots through tModLoader and loads mods from the Steam Workshop.",
    });
  } catch (err: any) {
    await restoreSnapshot(snapshot.id);
    await discardSnapshot(snapshot.id);
    return NextResponse.json({
      error: `tModLoader installation failed and was rolled back. Cause: ${err.message}`,
      ...(err instanceof SandboxBootError ? { bootOutput: err.output } : {}),
    }, { status: 500 });
  }
}
