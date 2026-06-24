import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import fs from "fs";
import path from "path";
import https from "https";
import { exec } from "child_process";

// Download utility
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlink(dest, () => {});
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// POST /api/servers/[id]/mods/install
// Body: { modType: string, modId?: string, modName?: string, downloadUrl?: string, workshopId?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;
    const { modType, modId, modName, downloadUrl, workshopId } = await req.json();

    // Find and verify server access
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    const { server } = access;

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json(
        { error: "Please stop the server before installing mods." },
        { status: 400 }
      );
    }

    const game = server.game.toUpperCase();

    if (game === "MINECRAFT") {
      if (!downloadUrl) {
        return NextResponse.json({ error: "Download URL is required for Minecraft mods." }, { status: 400 });
      }
      
      const modsDir = path.join(dataRoot(), "local-servers", serverId, "mods");
      if (!fs.existsSync(modsDir)) {
        fs.mkdirSync(modsDir, { recursive: true });
      }

      const filename = modId ? `${modId}.jar` : path.basename(downloadUrl) || "mod.jar";
      const destPath = path.join(modsDir, filename);

      await downloadFile(downloadUrl, destPath);

    } else if (game === "VALHEIM") {
      if (modType === "BEPINEX") {
        const valheimDir = path.join(dataRoot(), "local-servers", serverId, "valheim-server");
        const zipPath = path.join(dataRoot(), "local-servers", serverId, "bepinex.zip");
        const defaultBepInExUrl = "https://github.com/BepInEx/BepInEx/releases/download/v5.4.22/BepInEx_x64_5.4.22.0.zip";

        if (!fs.existsSync(valheimDir)) {
          return NextResponse.json({ error: "Valheim server directory not found. Please start/install the server first." }, { status: 400 });
        }

        // Download BepInEx
        await downloadFile(defaultBepInExUrl, zipPath);

        // Extract using PowerShell
        await new Promise<void>((resolve, reject) => {
          const extractCmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${valheimDir}' -Force"`;
          exec(extractCmd, (err) => {
            try { fs.unlinkSync(zipPath); } catch (_) {}
            if (err) {
              reject(new Error(`Failed to extract BepInEx: ${err.message}`));
            } else {
              resolve();
            }
          });
        });
      } else {
        // Valheim plugin installation (.dll files inside BepInEx/plugins)
        if (!downloadUrl) {
          return NextResponse.json({ error: "Download URL is required for Valheim plugins." }, { status: 400 });
        }
        const pluginsDir = path.join(dataRoot(), "local-servers", serverId, "valheim-server", "BepInEx", "plugins");
        if (!fs.existsSync(pluginsDir)) {
          fs.mkdirSync(pluginsDir, { recursive: true });
        }
        const filename = modId ? `${modId}.dll` : path.basename(downloadUrl) || "plugin.dll";
        await downloadFile(downloadUrl, path.join(pluginsDir, filename));
      }

    } else if (game === "ZOMBOID") {
      if (!workshopId || !modId) {
        return NextResponse.json({ error: "Both Workshop ID and Mod ID are required for Project Zomboid mods." }, { status: 400 });
      }

      const zomboidDir = path.join(dataRoot(), "local-servers", serverId, "zomboid-server");
      const serverConfigDir = path.join(zomboidDir, "zomboid-data", "Server");
      if (!fs.existsSync(serverConfigDir)) {
        fs.mkdirSync(serverConfigDir, { recursive: true });
      }
      
      const iniPath = path.join(serverConfigDir, "servertest.ini");
      let iniContent = "";
      if (fs.existsSync(iniPath)) {
        iniContent = fs.readFileSync(iniPath, "utf-8");
      }

      // 1. Append to WorkshopItems=
      const workshopRegex = /^WorkshopItems=(.*)$/m;
      const workshopMatch = iniContent.match(workshopRegex);
      if (workshopMatch) {
        const currentItems = workshopMatch[1].trim();
        if (currentItems.includes(workshopId)) {
          // Already installed
        } else {
          const newItems = currentItems ? `${currentItems};${workshopId}` : workshopId;
          iniContent = iniContent.replace(workshopRegex, `WorkshopItems=${newItems}`);
        }
      } else {
        iniContent += `\nWorkshopItems=${workshopId}\n`;
      }

      // 2. Append to Mods=
      const modsRegex = /^Mods=(.*)$/m;
      const modsMatch = iniContent.match(modsRegex);
      if (modsMatch) {
        const currentMods = modsMatch[1].trim();
        if (currentMods.includes(modId)) {
          // Already installed
        } else {
          const newMods = currentMods ? `${currentMods};${modId}` : modId;
          iniContent = iniContent.replace(modsRegex, `Mods=${newMods}`);
        }
      } else {
        iniContent += `\nMods=${modId}\n`;
      }

      fs.writeFileSync(iniPath, iniContent);

    } else {
      return NextResponse.json({ error: `Mods are not supported for game: ${server.game}` }, { status: 400 });
    }

    // Log action
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTORE_SERVER",
        details: `Installed mod '${modName || modId || workshopId}' on server '${server.name}' (${server.game}).`,
      },
    });

    return NextResponse.json({ success: true, message: "Mod installed successfully!" });
  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/install error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
