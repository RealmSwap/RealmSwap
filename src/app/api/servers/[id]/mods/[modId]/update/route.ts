import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { createSnapshot, restoreSnapshot } from "@/lib/snapshots";
import { testServerBoot } from "@/lib/runners/sandbox";
import { downloadFile } from "@/lib/download";
import { detectMinecraftVersion, readLoaderMarker } from "@/lib/mods/mcLoaders";
import { resolveInstallCandidate } from "@/lib/mods/modrinth";
import path from "path";

// POST: check for and install a newer version of an installed Modrinth mod.
// Snapshot -> replace jar -> sandbox test -> rollback on failure, same
// contract as installs. Currently Minecraft/Modrinth installations only.
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

    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Mod updates are currently supported for Minecraft servers only." }, { status: 400 });
    }
    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before updating mods." }, { status: 400 });
    }

    const installation = await prisma.modInstallation.findFirst({
      where: { serverId, packageId: params.modId, provider: "modrinth" },
    });
    if (!installation) {
      return NextResponse.json({ error: "Installed Modrinth mod not found." }, { status: 404 });
    }

    const installDir = path.join(dataRoot(), "local-servers", serverId);
    const marker = readLoaderMarker(installDir);
    const candidate = await resolveInstallCandidate(installation.packageId, {
      gameVersion: detectMinecraftVersion(installDir),
      loader: marker?.type ?? null,
    });

    if (candidate.version.version_number === installation.version) {
      return NextResponse.json({
        success: true,
        updated: false,
        message: `${installation.name} is up to date (${installation.version}).`,
      });
    }

    const snapshot = await createSnapshot(serverId, user.id, `Pre-update: ${installation.name}`);
    try {
      const dest = safeJoin(path.join(installDir, "mods"), `${installation.packageId}.jar`);
      await downloadFile(candidate.file.url, dest);
      await testServerBoot(serverId, "MINECRAFT");

      await prisma.modInstallation.update({
        where: { id: installation.id },
        data: { version: candidate.version.version_number, updatedAt: new Date() },
      });
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "UPDATE_MOD",
          details: `Updated mod '${installation.name}' ${installation.version} → ${candidate.version.version_number} on server '${server.name}'.`,
        },
      });

      return NextResponse.json({
        success: true,
        updated: true,
        from: installation.version,
        to: candidate.version.version_number,
        message: `${installation.name} updated to ${candidate.version.version_number} and passed sandbox testing.`,
      });
    } catch (err: any) {
      await restoreSnapshot(snapshot.id);
      await prisma.serverSnapshot.delete({ where: { id: snapshot.id } });
      return NextResponse.json({
        error: `Update failed and was rolled back. Cause: ${err.message}`,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/[modId]/update error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
