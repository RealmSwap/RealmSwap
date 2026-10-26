import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { resolveModUpdate, UpdateResolutionError } from "@/lib/mods/updateApply";
import { resolveRemoteModUpdate } from "@/lib/mods/remoteInstallers";
import { rollbackRemoteInstall, RemoteShipError } from "@/lib/mods/remoteInstallers";
import { requireLocalServer } from "@/lib/agents/perimeter";

// POST: check for and install a newer version of an installed mod.
// Snapshot -> replace files -> sandbox test -> rollback on failure, same
// contract as installs. Supports Minecraft/Modrinth jars and
// Valheim/Thunderstore packages. AGENT servers resolve remotely (no sandbox
// boot test — the node's pre-apply tar is the rollback).
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string; modId: string }> }
) {
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
    const isAgent = server.runnerType === "AGENT";
    if (!isAgent) requireLocalServer(server, "Mod updates");

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before updating mods." }, { status: 400 });
    }

    const installation = await prisma.modInstallation.findFirst({
      where: { serverId, packageId: params.modId },
    });
    if (!installation) {
      return NextResponse.json({ error: "Installed mod not found." }, { status: 404 });
    }

    // Resolve the newest available version before touching anything, so an
    // up-to-date mod never touches the server.
    let newVersionNumber: string;
    let applyUpdate: () => Promise<void>;
    let rowPatch: Record<string, string> = {};
    let warnings: string[] = [];
    try {
      const resolved = isAgent
        ? await resolveRemoteModUpdate(installation, game, serverId)
        : await resolveModUpdate(installation, game, serverId);
      newVersionNumber = resolved.newVersionNumber;
      applyUpdate = resolved.applyUpdate;
      rowPatch = resolved.rowPatch ?? {};
      warnings = resolved.warnings ?? [];
    } catch (err: any) {
      if (err instanceof UpdateResolutionError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    if (newVersionNumber === installation.version) {
      return NextResponse.json({
        success: true,
        updated: false,
        message: `${installation.name} is up to date (${installation.version}).`,
      });
    }

    if (isAgent) {
      try {
        await applyUpdate();
        await prisma.modInstallation.update({
          where: { id: installation.id },
          data: { version: newVersionNumber, updatedAt: new Date(), ...rowPatch },
        });
        await prisma.activityLog.create({
          data: {
            userId: user.id,
            action: "UPDATE_MOD",
            details: `Updated mod '${installation.name}' ${installation.version} → ${newVersionNumber} on node server '${server.name}'.`,
          },
        });
        return NextResponse.json({
          success: true,
          updated: true,
          from: installation.version,
          to: newVersionNumber,
          message: `${installation.name} updated to ${newVersionNumber} on the node. (Remote nodes skip the sandbox boot test — watch the next start in the console.)`,
        });
      } catch (err: any) {
        if (err instanceof RemoteShipError) {
          await rollbackRemoteInstall(serverId, err).catch(() => {});
          return NextResponse.json({
            error: `Update failed on the node. Rollback completed. Cause: ${err.message}`,
          }, { status: 500 });
        }
        return NextResponse.json({ error: `Update failed. Cause: ${err.message}` }, { status: 500 });
      }
    }

    const snapshot = await createSnapshot(serverId, user.id, `Pre-update: ${installation.name}`);
    try {
      await applyUpdate();
      await testServerBoot(serverId, game);

      await prisma.modInstallation.update({
        where: { id: installation.id },
        data: { version: newVersionNumber, updatedAt: new Date(), ...rowPatch },
      });
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "UPDATE_MOD",
          details: `Updated mod '${installation.name}' ${installation.version} → ${newVersionNumber} on server '${server.name}'.`,
        },
      });

      return NextResponse.json({
        success: true,
        updated: true,
        from: installation.version,
        to: newVersionNumber,
        message: `${installation.name} updated to ${newVersionNumber} and passed sandbox testing.${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
      });
    } catch (err: any) {
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);
      return NextResponse.json({
        error: `Update failed and was rolled back. Cause: ${err.message}`,
        ...(err instanceof SandboxBootError ? { bootOutput: err.output } : {}),
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/[modId]/update error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
