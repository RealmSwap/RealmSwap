import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";
import { dataRoot } from "@/lib/appPaths";
import { removeZomboidWorkshopMod, removeZomboidWorkshopModContent, zomboidServerIniPath } from "@/lib/mods/zomboid";
import { removeArkActiveMod, removeArkActiveModContent, arkGameUserSettingsIniPath } from "@/lib/mods/ark";
import { uninstallPalworldPackage } from "@/lib/mods/palworld";
import { removeFicsitMod } from "@/lib/mods/installers";
import { removeRustUmodPlugin } from "@/lib/mods/umod";
import { removeTmlWorkshopMod } from "@/lib/mods/tml";
import { agentReadServerFile, agentWriteServerFile } from "@/lib/agents/agentFiles";
import { deleteNodePaths } from "@/lib/agents/agentMods";
import { requireLocalServer } from "@/lib/agents/perimeter";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; modId: string }> }
) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;
    const modId = params.modId;

    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }

    const game = access.server.game.toUpperCase();
    if (access.server.runnerType === "AGENT") {
      return await uninstallOnAgentNode(access.server, game, modId, user.id);
    }
    requireLocalServer(access.server, "Mod uninstalls");

    // Find the installation record
    const installation = await prisma.modInstallation.findFirst({
      where: {
        serverId,
        packageId: modId
      }
    });

    if (!installation) {
      return NextResponse.json({ error: "Mod not found in database" }, { status: 404 });
    }

    // Physical deletion
    if (game === "VALHEIM") {
      const pluginsDir = path.join(dataRoot(), "local-servers", serverId, "valheim-server", "BepInEx", "plugins");
      const dllPath = path.join(pluginsDir, `${modId}.dll`);
      if (fs.existsSync(dllPath)) {
        fs.unlinkSync(dllPath);
      }
      
      const zipPath = path.join(pluginsDir, `${modId}.zip`);
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      // Zip installs extract into a per-mod folder — remove it too
      const modDir = path.join(pluginsDir, modId);
      if (fs.existsSync(modDir) && fs.statSync(modDir).isDirectory()) {
        fs.rmSync(modDir, { recursive: true, force: true });
      }
    } else if (game === "VRISING") {
      // Same layout as Valheim: per-package folders (or loose dlls) under
      // BepInEx/plugins.
      const pluginsDir = path.join(dataRoot(), "local-servers", serverId, "vrising-server", "BepInEx", "plugins");
      const dllPath = path.join(pluginsDir, `${modId}.dll`);
      if (fs.existsSync(dllPath)) {
        fs.unlinkSync(dllPath);
      }
      const zipPath = path.join(pluginsDir, `${modId}.zip`);
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
      const modDir = path.join(pluginsDir, modId);
      if (fs.existsSync(modDir) && fs.statSync(modDir).isDirectory()) {
        fs.rmSync(modDir, { recursive: true, force: true });
      }
    } else if (game === "RUST") {
      removeRustUmodPlugin(path.join(dataRoot(), "local-servers", serverId, "rust-server"), modId);
    } else if (game === "MINECRAFT") {
      const modsDir = path.join(dataRoot(), "local-servers", serverId, "mods");
      const jarPath = path.join(modsDir, `${modId}.jar`);
      if (fs.existsSync(jarPath)) {
        fs.unlinkSync(jarPath);
      }
    } else if (game === "ZOMBOID") {
      // packageId is the Workshop ID (WorkshopItems=); the ini mod IDs for
      // Mods= are stored ';'-joined on the row (one item can ship several
      // mod folders) — the two id spaces are unrelated.
      removeZomboidWorkshopMod(
        zomboidServerIniPath(path.join(dataRoot(), "local-servers", serverId)),
        installation.packageId,
        installation.workshopModId ? installation.workshopModId.split(";").filter(Boolean) : null
      );
    } else if (game === "ARK") {
      removeArkActiveMod(
        arkGameUserSettingsIniPath(path.join(dataRoot(), "local-servers", serverId)),
        installation.packageId
      );
    } else if (game === "TERRARIA") {
      // Drops the item's names from enabled.json and deletes its downloaded
      // workshop content dir (the .tmod lives inside it — tML loads straight
      // from there, there is no copy in Mods/).
      removeTmlWorkshopMod(
        path.join(dataRoot(), "local-servers", serverId),
        installation.packageId,
        installation.workshopModId ? installation.workshopModId.split(";").filter(Boolean) : []
      );
    } else if (game === "SATISFACTORY") {
      removeFicsitMod(path.join(dataRoot(), "local-servers", serverId, "satisfactory-server"), installation.packageId);
    } else if (game === "PALWORLD") {
      // Shimloader layout: per-package uninstall manifest lists the exact
      // installed paths (mods/, paks/, cfgs/, overlay/ contributions).
      uninstallPalworldPackage({
        palworldDir: path.join(dataRoot(), "local-servers", serverId, "palworld-server"),
        fullName: installation.packageId,
      });
    }

    // Delete record
    await prisma.modInstallation.delete({
      where: {
        serverId_provider_packageId: {
          serverId,
          provider: installation.provider,
          packageId: modId
        }
      }
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "UNINSTALL_MOD",
        details: `Uninstalled mod '${installation.name}' from server '${access.server.name}' (${access.server.game}).`,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`DELETE /api/servers/[id]/mods/${params.modId} error:`, error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * AGENT-server uninstall: the same per-game deletions, expressed as
 * data-dir-relative paths for the node (or ini edits ferried over the file
 * commands). Unknown paths are skipped agent-side.
 */
async function uninstallOnAgentNode(
  server: { id: string; name: string; game: string },
  game: string,
  modId: string,
  userId: string
) {
  const serverId = server.id;

  const installation = await prisma.modInstallation.findFirst({
    where: { serverId, packageId: modId },
  });
  if (!installation) {
    return NextResponse.json({ error: "Mod not found in database" }, { status: 404 });
  }

  if (game === "VALHEIM" || game === "VRISING") {
    const subDir = game === "VALHEIM" ? "valheim-server" : "vrising-server";
    await deleteNodePaths(serverId, [
      `${subDir}/BepInEx/plugins/${modId}`,
      `${subDir}/BepInEx/plugins/${modId}.dll`,
      `${subDir}/BepInEx/plugins/${modId}.zip`,
    ]);
  } else if (game === "RUST") {
    await deleteNodePaths(serverId, [`rust-server/Oxide/plugins/${modId}.cs`]);
  } else if (game === "MINECRAFT") {
    await deleteNodePaths(serverId, [`mods/${modId}.jar`]);
  } else if (game === "ZOMBOID") {
    const iniRel = "zomboid-server/zomboid-data/Server/servertest.ini";
    const remote = await agentReadServerFile(serverId, iniRel);
    if (remote.exists && remote.content !== null) {
      const updated = removeZomboidWorkshopModContent(
        remote.content,
        installation.packageId,
        installation.workshopModId ? installation.workshopModId.split(";").filter(Boolean) : []
      );
      await agentWriteServerFile(serverId, iniRel, updated, { backup: true });
    }
  } else if (game === "ARK") {
    const iniRel = "ark-server/ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini";
    const remote = await agentReadServerFile(serverId, iniRel);
    if (remote.exists && remote.content !== null) {
      const updated = removeArkActiveModContent(remote.content, installation.packageId);
      if (updated !== null) {
        await agentWriteServerFile(serverId, iniRel, updated, { backup: true });
      }
    }
  } else {
    return NextResponse.json(
      { error: `Mod uninstalls for '${server.game}' aren't supported on remote-node servers yet.` },
      { status: 400 }
    );
  }

  await prisma.modInstallation.delete({
    where: {
      serverId_provider_packageId: {
        serverId,
        provider: installation.provider,
        packageId: modId,
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      action: "UNINSTALL_MOD",
      details: `Uninstalled mod '${installation.name}' from node server '${server.name}' (${server.game}).`,
    },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
