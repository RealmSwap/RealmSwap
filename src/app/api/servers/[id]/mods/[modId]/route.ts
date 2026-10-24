import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";
import { dataRoot } from "@/lib/appPaths";
import { removeZomboidWorkshopMod, zomboidServerIniPath } from "@/lib/mods/zomboid";
import { removeArkActiveMod, arkGameUserSettingsIniPath } from "@/lib/mods/ark";
import { uninstallPalworldPackage } from "@/lib/mods/palworld";
import { removeFicsitMod } from "@/lib/mods/installers";
import { removeRustUmodPlugin } from "@/lib/mods/umod";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; modId: string } }
) {
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
