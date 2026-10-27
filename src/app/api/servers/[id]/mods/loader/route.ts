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
import { detectRemoteMinecraftVersion, installMcLoaderRemote } from "@/lib/mods/remoteInstallers";
import { readRemoteLoaderMarker } from "@/lib/mods/remoteInstallers";
import fs from "fs";
import path from "path";
import { requireLocalServer } from "@/lib/agents/perimeter";
import { beginProgress, emitProgress, endProgress } from "@/lib/mods/progress";

const LOADER_LABELS: Record<string, string> = {
  fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge",
  tmodloader: "tModLoader",
};

// GET: current loader state for the Mod Manager UI.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const game = access.server.game.toUpperCase();
    if (access.server.runnerType === "AGENT") {
      if (game === "MINECRAFT") {
        return NextResponse.json({ supported: true, loader: await readRemoteLoaderMarker(params.id) });
      }
      return NextResponse.json({ supported: false, loader: null });
    }
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
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;
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
      installId: z.string().regex(/^[\w-]{6,64}$/).optional(),
    });
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    if (server.runnerType === "AGENT") {
      return installLoaderOnAgentNode(server, game, user.id, parsed.data.loader);
    }
    requireLocalServer(server, "Mod loader installs");

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

    const installId = parsed.data.installId;
    if (installId) {
      beginProgress(installId);
      emitProgress(installId, { stage: "snapshot", label: "Taking a safety snapshot" });
    }
    const snapshot = await createSnapshot(serverId, user.id, `Pre-install: ${loaderName} loader`);
    try {
      // Loader installers log their own milestones (download, installer run)
      // — each one becomes the live label.
      const onLog = (msg: string) => {
        console.log(`[Loader ${serverId}] ${msg}`);
        if (installId) emitProgress(installId, { stage: "loader", label: msg });
      };
      if (installId) emitProgress(installId, { stage: "loader", label: `Installing ${loaderName} for Minecraft ${minecraftVersion}`, current: 0, total: 1 });
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
      if (installId) emitProgress(installId, { stage: "boot", label: "Booting the server once to verify the loader", current: 0, total: 1 });
      await testServerBoot(serverId, "MINECRAFT");
      if (installId) emitProgress(installId, { current: 1 });

      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "INSTALL_MOD",
          details: `Installed ${loaderName} ${marker.loaderVersion} loader (Minecraft ${minecraftVersion}) on server '${server.name}'.`,
        },
      });

      if (installId) endProgress(installId, "done");
      return NextResponse.json({
        success: true,
        loader: marker,
        message: `${loaderName} ${marker.loaderVersion} installed. The server now loads jars from mods/.`,
      });
    } catch (err: any) {
      if (installId) emitProgress(installId, { label: "Loader install failed — rolling back safely" });
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);
      if (installId) endProgress(installId, "error", err.message);
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

/**
 * AGENT-server loader install: the installer runs ON the node in a throwaway
 * JDK container against /data (a loader installer needs Java + the server's
 * files — both live there). The node tar-asides the loader-touched paths
 * before the installer runs, which is the rollback; no sandbox boot test
 * exists remotely, so the response says so.
 */
async function installLoaderOnAgentNode(
  server: { id: string; name: string; game: string; status: string },
  game: string,
  userId: string,
  loader: "fabric" | "quilt" | "forge" | "neoforge" | "tmodloader"
) {
  if (game !== "MINECRAFT" || loader === "tmodloader") {
    return NextResponse.json(
      { error: "Only the Java loaders (fabric/quilt/forge/neoforge) are supported on Minecraft node servers. tModLoader isn't supported on remote nodes yet." },
      { status: 400 }
    );
  }

  const existing = await readRemoteLoaderMarker(server.id);
  if (existing && existing.type !== loader) {
    return NextResponse.json(
      { error: `This server already runs the ${LOADER_LABELS[existing.type]} loader. To switch loaders, delete the server and redeploy, or clear ${existing.type}'s files on the node first.` },
      { status: 400 }
    );
  }

  const minecraftVersion = await detectRemoteMinecraftVersion(server.id);
  if (!minecraftVersion) {
    return NextResponse.json(
      { error: "Couldn't read the server's Minecraft version — start the server once first so its files exist on the node." },
      { status: 400 }
    );
  }

  try {
    const marker = await installMcLoaderRemote({
      serverId: server.id,
      loader,
      minecraftVersion,
      onLog: (msg: string) => console.log(`[Loader ${server.id}] ${msg}`),
    });

    await prisma.activityLog.create({
      data: {
        userId,
        action: "INSTALL_MOD",
        details: `Installed ${LOADER_LABELS[loader]} ${marker.loaderVersion} loader (Minecraft ${minecraftVersion}) on node server '${server.name}'.`,
      },
    });

    return NextResponse.json({
      success: true,
      loader: marker,
      message: `${LOADER_LABELS[loader]} ${marker.loaderVersion} installed on the node. The server now loads jars from mods/ at its next start. (Remote nodes skip the sandbox boot test.)`,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: `Loader installation failed on the node${err?.message ? `. Cause: ${err.message}` : ""}${err instanceof Error && err.message.includes("rolled back") ? "" : "."}`,
    }, { status: 500 });
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
