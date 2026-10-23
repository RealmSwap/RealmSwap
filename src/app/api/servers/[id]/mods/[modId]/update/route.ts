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
import { communityForGame, fetchCommunityIndex, isBepInExCore, newestVersion, extractThunderstorePackage } from "@/lib/mods/thunderstore";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

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

    const serverRoot = path.join(dataRoot(), "local-servers", serverId);

    // Resolve the newest available version before taking a snapshot, so an
    // up-to-date mod never touches the server.
    let newVersionNumber: string;
    let downloadUrl: string;
    let applyUpdate: () => Promise<void>;

    if (installation.provider === "modrinth") {
      if (game !== "MINECRAFT") {
        return NextResponse.json({ error: "Modrinth mod updates are supported for Minecraft servers only." }, { status: 400 });
      }
      const marker = readLoaderMarker(serverRoot);
      const candidate = await resolveInstallCandidate(installation.packageId, {
        gameVersion: detectMinecraftVersion(serverRoot),
        loader: marker?.type ?? null,
      });
      newVersionNumber = candidate.version.version_number;
      downloadUrl = candidate.file.url;
      const dest = safeJoin(path.join(serverRoot, "mods"), `${installation.packageId}.jar`);
      applyUpdate = async () => { await downloadFile(downloadUrl, dest); };
    } else if (installation.provider === "thunderstore") {
      if (game !== "VALHEIM") {
        return NextResponse.json({ error: "Thunderstore mod updates are supported for Valheim servers only." }, { status: 400 });
      }
      const community = communityForGame(game);
      if (!community) {
        return NextResponse.json({ error: "Mods are not supported for this game." }, { status: 400 });
      }
      const index = await fetchCommunityIndex(community);
      const pkg = index.find((p) => p.full_name === installation.packageId);
      if (!pkg) {
        return NextResponse.json({ error: `Package '${installation.packageId}' not found on Thunderstore.` }, { status: 404 });
      }
      const latest = newestVersion(pkg);
      if (!latest) {
        return NextResponse.json({ error: `Package '${installation.packageId}' has no published versions.` }, { status: 404 });
      }
      newVersionNumber = latest.version_number;
      downloadUrl = latest.download_url;
      const pluginsDir = path.join(serverRoot, "valheim-server", "BepInEx", "plugins");
      const modDir = safeJoin(pluginsDir, installation.packageId);
      if (isBepInExCore(installation.packageId)) {
        // The core pack installs over the server root, not the plugins dir —
        // same as the install route's auto-provisioning.
        const serverDir = path.join(serverRoot, "valheim-server");
        const tempZip = safeJoin(serverDir, ".bepinex-core.staging.zip");
        applyUpdate = async () => {
          await downloadFile(downloadUrl, tempZip);
          try {
            const zip = new AdmZip(tempZip);
            zip.extractAllTo(serverDir, true);
          } finally {
            try { fs.unlinkSync(tempZip); } catch (_) {}
          }
        };
      } else {
        applyUpdate = async () => {
          const tempZip = safeJoin(pluginsDir, `.${installation.packageId}.staging.zip`);
          await downloadFile(downloadUrl, tempZip);
          try {
            const zip = new AdmZip(tempZip);
            fs.rmSync(modDir, { recursive: true, force: true });
            extractThunderstorePackage(zip, modDir);
          } finally {
            try { fs.unlinkSync(tempZip); } catch (_) {}
          }
        };
      }
    } else {
      return NextResponse.json(
        { error: `Updates are not supported for provider '${installation.provider}'.` },
        { status: 400 }
      );
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
