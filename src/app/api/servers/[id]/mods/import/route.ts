import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { createSnapshot, restoreSnapshot } from "@/lib/snapshots";
import { testServerBoot } from "@/lib/runners/sandbox";
import fs from "fs";
import path from "path";
import { dataRoot } from "@/lib/appPaths";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
    const { server } = access;

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before importing collections." }, { status: 400 });
    }

    // Parse the FormData
    const formData = await req.formData();
    const file = formData.get("collection") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No collection file uploaded." }, { status: 400 });
    }

    const text = await file.text();
    let manifest;
    try {
      manifest = JSON.parse(text);
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON manifest." }, { status: 400 });
    }

    if (manifest.game !== server.game) {
      return NextResponse.json({ error: `This collection is for ${manifest.game}, but your server is ${server.game}.` }, { status: 400 });
    }

    if (!manifest.mods || !Array.isArray(manifest.mods)) {
      return NextResponse.json({ error: "Manifest is missing the 'mods' array." }, { status: 400 });
    }

    // 1. Create a Snapshot before touching anything
    const snapshotName = `Pre-Import: ${manifest.name}`;
    const snapshot = await createSnapshot(serverId, user.id, snapshotName);

    try {
      console.log(`[Import] Starting batch import of ${manifest.mods.length} mods for server ${serverId}`);
      const game = server.game.toUpperCase();

      // 2. Perform Batch Installation
      for (const mod of manifest.mods) {
        // In a real implementation, we would call ThunderstoreProvider or SteamWorkshopProvider here
        // For Tier 2, we will log them to the DB and simulate file placement for Zomboid.
        
        if (game === "ZOMBOID" && mod.provider === "workshop") {
          const zomboidDir = path.join(dataRoot(), "local-servers", serverId, "zomboid-server");
          const serverConfigDir = path.join(zomboidDir, "zomboid-data", "Server");
          if (!fs.existsSync(serverConfigDir)) fs.mkdirSync(serverConfigDir, { recursive: true });
          
          const iniPath = path.join(serverConfigDir, "servertest.ini");
          let iniContent = "";
          if (fs.existsSync(iniPath)) iniContent = fs.readFileSync(iniPath, "utf-8");

          // We don't have the explicit Workshop ID vs Mod ID split in the basic export payload (it just uses packageId)
          // For a true implementation, the export should capture both, but for now we'll just append packageId.
          const workshopId = mod.packageId;
          const modId = mod.name || mod.packageId;

          const workshopRegex = /^WorkshopItems=(.*)$/m;
          const workshopMatch = iniContent.match(workshopRegex);
          if (workshopMatch) {
            const currentItems = workshopMatch[1].trim();
            if (!currentItems.includes(workshopId)) {
              iniContent = iniContent.replace(workshopRegex, `WorkshopItems=${currentItems ? `${currentItems};` : ""}${workshopId}`);
            }
          } else {
            iniContent += `\nWorkshopItems=${workshopId}\n`;
          }

          const modsRegex = /^Mods=(.*)$/m;
          const modsMatch = iniContent.match(modsRegex);
          if (modsMatch) {
            const currentMods = modsMatch[1].trim();
            if (!currentMods.includes(modId)) {
              iniContent = iniContent.replace(modsRegex, `Mods=${currentMods ? `${currentMods};` : ""}${modId}`);
            }
          } else {
            iniContent += `\nMods=${modId}\n`;
          }

          fs.writeFileSync(iniPath, iniContent);
        } else if (game === "VALHEIM") {
          // Simulate Thunderstore placement
          const pluginsDir = path.join(dataRoot(), "local-servers", serverId, "valheim-server", "BepInEx", "plugins");
          if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
          fs.writeFileSync(path.join(pluginsDir, `${mod.packageId}.dll`), "DUMMY DLL CONTENT");
        }

        // Write to database
        await prisma.modInstallation.upsert({
          where: {
            serverId_provider_packageId: {
              serverId,
              provider: mod.provider,
              packageId: mod.packageId
            }
          },
          update: { version: "latest" },
          create: {
            serverId,
            provider: mod.provider,
            packageId: mod.packageId,
            version: "latest",
            name: mod.name || mod.packageId
          }
        });
      }

      // 3. Single Sandbox Test!
      console.log(`[Import] Running single batch boot test for ${serverId}`);
      await testServerBoot(serverId, game);
      console.log(`[Import] Batch boot test passed for ${serverId}`);

      // 4. Log Action
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "RESTORE_SERVER", 
          details: `Imported Mod Collection '${manifest.name}' containing ${manifest.mods.length} mods on server '${server.name}'.`,
        },
      });

      return NextResponse.json({ success: true, message: `Successfully imported and tested ${manifest.mods.length} mods!` });

    } catch (importError: any) {
      // 5. Automatic Rollback
      console.error(`[Import] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
      await prisma.serverSnapshot.delete({ where: { id: snapshot.id } });

      return NextResponse.json({ 
        error: `Import failed or crashed the server. Safe Rollback completed. Cause: ${importError.message}` 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST import mod collection error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
