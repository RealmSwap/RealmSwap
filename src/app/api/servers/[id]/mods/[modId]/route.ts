import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";
import { dataRoot } from "@/lib/appPaths";

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

    const access = await verifyServerAccess(serverId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
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
      
      // Also try to find any zip if it was a BepInEx pack
      const zipPath = path.join(pluginsDir, `${modId}.zip`);
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    } else if (game === "MINECRAFT") {
      const modsDir = path.join(dataRoot(), "local-servers", serverId, "mods");
      const jarPath = path.join(modsDir, `${modId}.jar`);
      if (fs.existsSync(jarPath)) {
        fs.unlinkSync(jarPath);
      }
    } else if (game === "ZOMBOID") {
      const serverConfigDir = path.join(dataRoot(), "local-servers", serverId, "zomboid-server", "zomboid-data", "Server");
      const iniPath = path.join(serverConfigDir, "servertest.ini");
      if (fs.existsSync(iniPath)) {
        let iniContent = fs.readFileSync(iniPath, "utf-8");
        
        // Remove from WorkshopItems
        const workshopRegex = /^WorkshopItems=(.*)$/m;
        const workshopMatch = iniContent.match(workshopRegex);
        if (workshopMatch) {
          const items = workshopMatch[1].split(";").filter(x => x.trim() !== "" && x.trim() !== modId);
          iniContent = iniContent.replace(workshopRegex, `WorkshopItems=${items.join(";")}`);
        }
        
        // Remove from Mods
        const modsRegex = /^Mods=(.*)$/m;
        const modsMatch = iniContent.match(modsRegex);
        if (modsMatch) {
          const mods = modsMatch[1].split(";").filter(x => x.trim() !== "" && x.trim() !== modId);
          iniContent = iniContent.replace(modsRegex, `Mods=${mods.join(";")}`);
        }
        
        fs.writeFileSync(iniPath, iniContent);
      }
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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`DELETE /api/servers/[id]/mods/${params.modId} error:`, error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
