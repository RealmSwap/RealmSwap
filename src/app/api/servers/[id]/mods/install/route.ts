import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { createSnapshot, restoreSnapshot } from "@/lib/snapshots";
import { testServerBoot } from "@/lib/runners/sandbox";
import fs from "fs";
import path from "path";
import https from "https";
import AdmZip from "adm-zip";

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
    const modInstallSchema = z.object({
      modType: z.enum(["STEAM_WORKSHOP", "MODRINTH", "BEPINEX", "THUNDERSTORE"]),
      modId: z.string().optional(),
      modName: z.string().optional(),
      downloadUrl: z.string().url("Invalid download URL").optional(),
      workshopId: z.string().optional(),
    });

    const body = await req.json();
    const parsed = modInstallSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid mod installation parameters", details: parsed.error.format() }, { status: 400 });
    }

    const { modType, modId, modName, downloadUrl, workshopId } = parsed.data;

    // Find and verify server access
    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json(
        { error: "Please stop the server before installing mods." },
        { status: 400 }
      );
    }

    const game = server.game.toUpperCase();

    // 1. Create a Snapshot before touching anything
    const snapshotName = `Pre-install: ${modName || modId || workshopId}`;
    const snapshot = await createSnapshot(serverId, user.id, snapshotName);

    try {
      // 2. Perform Installation
      if (game === "MINECRAFT") {
        if (!downloadUrl) {
          throw new Error("Download URL is required for Minecraft mods.");
        }
        
        const modsDir = path.join(dataRoot(), "local-servers", serverId, "mods");
        if (!fs.existsSync(modsDir)) {
          fs.mkdirSync(modsDir, { recursive: true });
        }

        let actualDownloadUrl = downloadUrl;
        // Resolve Modrinth project URLs to actual file URLs
        if (actualDownloadUrl.includes("modrinth.com/mod/")) {
          const res = await fetch(`https://api.modrinth.com/v2/project/${modId}/version`);
          if (res.ok) {
            const versions = await res.json();
            if (versions.length > 0 && versions[0].files && versions[0].files.length > 0) {
              actualDownloadUrl = versions[0].files[0].url;
            } else {
              throw new Error("No file versions found for this Modrinth project.");
            }
          } else {
            throw new Error(`Failed to resolve Modrinth project version: ${res.statusText}`);
          }
        }

        const filename = modId ? `${modId}.jar` : path.basename(actualDownloadUrl) || "mod.jar";
        const destPath = safeJoin(modsDir, filename);

        await downloadFile(actualDownloadUrl, destPath);

      } else if (game === "VALHEIM") {
        if (modType === "BEPINEX") {
          const valheimDir = path.join(dataRoot(), "local-servers", serverId, "valheim-server");
          const zipPath = path.join(dataRoot(), "local-servers", serverId, "bepinex.zip");
          const defaultBepInExUrl = "https://github.com/BepInEx/BepInEx/releases/download/v5.4.22/BepInEx_x64_5.4.22.0.zip";

          if (!fs.existsSync(valheimDir)) {
            throw new Error("Valheim server directory not found. Please start/install the server first.");
          }

          // Download BepInEx
          await downloadFile(defaultBepInExUrl, zipPath);

          // Extract using AdmZip
          try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(valheimDir, true);
            try { fs.unlinkSync(zipPath); } catch (_) {}
          } catch (err: any) {
            throw new Error(`Failed to extract BepInEx: ${err.message}`);
          }
        } else {
          // Valheim plugin installation (.dll files inside BepInEx/plugins)
          if (!downloadUrl) {
            throw new Error("Download URL is required for Valheim plugins.");
          }
          const valheimDir = path.join(dataRoot(), "local-servers", serverId, "valheim-server");
          const bepinexCheckFile = path.join(valheimDir, "doorstop_config.ini");
          
          if (!fs.existsSync(bepinexCheckFile)) {
            console.log(`[Sandbox] BepInEx not found for server ${serverId}. Auto-installing core framework first...`);
            const zipPath = path.join(dataRoot(), "local-servers", serverId, "bepinex.zip");
            const defaultBepInExUrl = "https://github.com/BepInEx/BepInEx/releases/download/v5.4.22/BepInEx_x64_5.4.22.0.zip";
            
            if (!fs.existsSync(valheimDir)) {
              fs.mkdirSync(valheimDir, { recursive: true });
            }
            
            await downloadFile(defaultBepInExUrl, zipPath);
            try {
              const zip = new AdmZip(zipPath);
              zip.extractAllTo(valheimDir, true);
              try { fs.unlinkSync(zipPath); } catch (_) {}
            } catch (err: any) {
              throw new Error(`Failed to extract BepInEx: ${err.message}`);
            }

            // Log BepInEx core as installed so it shows in the UI
            await prisma.modInstallation.upsert({
              where: {
                serverId_provider_packageId: {
                  serverId,
                  provider: "thunderstore",
                  packageId: "denikson-BepInExPack_Valheim"
                }
              },
              update: { version: "5.4.2202" },
              create: {
                serverId,
                provider: "thunderstore",
                packageId: "denikson-BepInExPack_Valheim",
                version: "5.4.2202",
                name: "BepInExPack Valheim"
              }
            });
          }

          const pluginsDir = path.join(valheimDir, "BepInEx", "plugins");
          if (!fs.existsSync(pluginsDir)) {
            fs.mkdirSync(pluginsDir, { recursive: true });
          }
          
          // Note: Thunderstore download URLs are actually .zip files. If the original implementation
          // downloaded them as .dll, it's saving a zip as a dll. We'll extract it properly.
          if (downloadUrl.endsWith(".zip")) {
            const tempZip = safeJoin(pluginsDir, `${modId}.zip`);
            await downloadFile(downloadUrl, tempZip);
            try {
              // Extract contents to a subfolder named after the mod to prevent clutter
              const modDestDir = safeJoin(pluginsDir, modId || "plugin");
              if (!fs.existsSync(modDestDir)) fs.mkdirSync(modDestDir, { recursive: true });
              const zip = new AdmZip(tempZip);
              zip.extractAllTo(modDestDir, true);
              try { fs.unlinkSync(tempZip); } catch (_) {}
            } catch (err: any) {
              throw new Error(`Failed to extract plugin archive: ${err.message}`);
            }
          } else {
            const filename = modId ? `${modId}.dll` : path.basename(downloadUrl) || "plugin.dll";
            await downloadFile(downloadUrl, safeJoin(pluginsDir, filename));
          }
        }

      } else if (game === "ZOMBOID") {
        if (!workshopId || !modId) {
          throw new Error("Both Workshop ID and Mod ID are required for Project Zomboid mods.");
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
        throw new Error(`Mods are not supported for game: ${server.game}`);
      }

      // 3. Sandbox Test!
      console.log(`[Sandbox] Running boot test for ${serverId}`);
      await testServerBoot(serverId, game);
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      // 4. Log to ModInstallation
      await prisma.modInstallation.upsert({
        where: {
          serverId_provider_packageId: {
            serverId,
            provider: game === "ZOMBOID" ? "workshop" : "thunderstore",
            packageId: modId || workshopId || "unknown"
          }
        },
        update: {
          version: "latest",
        },
        create: {
          serverId,
          provider: game === "ZOMBOID" ? "workshop" : "thunderstore",
          packageId: modId || workshopId || "unknown",
          version: "latest",
          name: modName || modId || workshopId || "Unknown Mod"
        }
      });

      // 5. Log action
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "RESTORE_SERVER", // we probably need an INSTALL_MOD action instead
          details: `Installed mod '${modName || modId || workshopId}' safely on server '${server.name}' (${server.game}).`,
        },
      });

      return NextResponse.json({ success: true, message: "Mod installed successfully and passed sandbox testing!" });

    } catch (installError: any) {
      // 6. Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
      
      // Cleanup the failed snapshot record
      await prisma.serverSnapshot.delete({ where: { id: snapshot.id } });

      return NextResponse.json({ 
        error: `Installation failed or crashed the server. Safe Rollback completed. Cause: ${installError.message}` 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/install error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
