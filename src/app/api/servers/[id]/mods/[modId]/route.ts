import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { prisma } from "@/lib/db";
import { removeZomboidWorkshopModContent } from "@/lib/mods/zomboid";
import { removeArkActiveModContent } from "@/lib/mods/ark";
import { removeModFiles, localServerRoot } from "@/lib/mods/uninstall";
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
    // Matches the other mod-mutation routes: files are held open while the
    // server runs (a Windows delete silently no-ops or half-applies), so the
    // UI's click-through surfaces this message instead of a dead button.
    if (access.server.status === "RUNNING" || access.server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before removing mods." }, { status: 400 });
    }

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

    // Physical deletion (per-game file removal shared with the boot healer's
    // quarantine step); the row delete below is the route's own business.
    removeModFiles({
      game,
      serverRoot: localServerRoot(serverId),
      installation,
    });

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
