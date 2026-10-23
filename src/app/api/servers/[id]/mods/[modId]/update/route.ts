import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { resolveModUpdate, UpdateResolutionError } from "@/lib/mods/updateApply";

// POST: check for and install a newer version of an installed mod.
// Snapshot -> replace files -> sandbox test -> rollback on failure, same
// contract as installs. Supports Minecraft/Modrinth jars and
// Valheim/Thunderstore packages.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; modId: string } }
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
    const game = server.game.toUpperCase();

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before updating mods." }, { status: 400 });
    }

    const installation = await prisma.modInstallation.findFirst({
      where: { serverId, packageId: params.modId },
    });
    if (!installation) {
      return NextResponse.json({ error: "Installed mod not found." }, { status: 404 });
    }

    // Resolve the newest available version before taking a snapshot, so an
    // up-to-date mod never touches the server.
    let newVersionNumber: string;
    let applyUpdate: () => Promise<void>;
    try {
      ({ newVersionNumber, applyUpdate } = await resolveModUpdate(installation, game, serverId));
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

    const snapshot = await createSnapshot(serverId, user.id, `Pre-update: ${installation.name}`);
    try {
      await applyUpdate();
      await testServerBoot(serverId, game);

      await prisma.modInstallation.update({
        where: { id: installation.id },
        data: { version: newVersionNumber, updatedAt: new Date() },
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
        message: `${installation.name} updated to ${newVersionNumber} and passed sandbox testing.`,
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
