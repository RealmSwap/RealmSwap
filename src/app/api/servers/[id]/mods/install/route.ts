import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { downloadFile } from "@/lib/download";
import {
  installMinecraftMod, installMinecraftCurseforge, installValheimThunderstore, installZomboidWorkshopMod,
} from "@/lib/mods/installers";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

// POST /api/servers/[id]/mods/install
// Body: { modType: string, modId?: string, modName?: string, downloadUrl?: string, workshopId?: string }
//
// Safety contract for every install: snapshot -> install (with dependency
// resolution and loader checks on Minecraft) -> sandbox boot test -> automatic
// rollback on any failure. The per-game install steps live in
// src/lib/mods/installers.ts (shared with mod-collection import).
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
      modType: z.enum(["STEAM_WORKSHOP", "MODRINTH", "CURSEFORGE", "BEPINEX", "THUNDERSTORE"]),
      modId: z.string().optional(),
      modName: z.string().optional(),
      version: z.string().optional(),
      downloadUrl: z.string().url("Invalid download URL").optional(),
      workshopId: z.string().optional(),
    });

    const body = await req.json();
    const parsed = modInstallSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid mod installation parameters", details: parsed.error.format() }, { status: 400 });
    }

    const { modType, modId, modName, version, downloadUrl, workshopId } = parsed.data;

    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before installing mods." }, { status: 400 });
    }

    const game = server.game.toUpperCase();
    const serverRoot = path.join(dataRoot(), "local-servers", serverId);

    // 1. Create a Snapshot before touching anything
    const snapshotName = `Pre-install: ${modName || modId || workshopId}`;
    const snapshot = await createSnapshot(serverId, user.id, snapshotName);

    // Filled during install for the response and the audit log.
    let warnings: string[] = [];
    let dependencyCount = 0;

    try {
      // 2. Perform Installation
      if (game === "MINECRAFT") {
        if (!modId) {
          throw new Error("A Modrinth project id or CurseForge mod id is required for Minecraft mods.");
        }
        const result =
          modType === "CURSEFORGE"
            ? await installMinecraftCurseforge({
                serverId,
                installDir: serverRoot, // Minecraft installs live at the server root
                modId,
                version,
                warnings,
              })
            : await installMinecraftMod({
                serverId,
                installDir: serverRoot, // Minecraft installs live at the server root
                projectId: modId,
                versionNumber: version,
                warnings,
              });
        dependencyCount = result.dependencyCount;

      } else if (game === "VALHEIM") {
        const valheimDir = path.join(serverRoot, "valheim-server");
        if (!fs.existsSync(valheimDir)) {
          throw new Error("Valheim server directory not found. Please start/install the server first.");
        }

        if (modType === "BEPINEX") {
          // Core framework install only (official release zip).
          const zipPath = path.join(serverRoot, "bepinex.zip");
          const defaultBepInExUrl = "https://github.com/BepInEx/BepInEx/releases/download/v5.4.22/BepInEx_x64_5.4.22.0.zip";

          await downloadFile(defaultBepInExUrl, zipPath);
          try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(valheimDir, true);
            try { fs.unlinkSync(zipPath); } catch (_) {}
          } catch (err: any) {
            throw new Error(`Failed to extract BepInEx: ${err.message}`);
          }
        } else {
          if (!modId) {
            throw new Error("A Thunderstore package id is required for Valheim mods.");
          }
          const result = await installValheimThunderstore({
            serverId,
            valheimDir,
            packageId: modId,
            name: modName,
            versionNumber: version,
            downloadUrl,
            warnings,
          });
          dependencyCount = result.dependencyCount;
        }

      } else if (game === "ZOMBOID") {
        if (!workshopId || !modId) {
          throw new Error("Both Workshop ID and Mod ID are required for Project Zomboid mods.");
        }
        await installZomboidWorkshopMod({
          serverId, serverRoot, workshopId, modId, name: modName,
        });

      } else {
        throw new Error(`Mods are not supported for game: ${server.game}`);
      }

      // 3. Sandbox Test
      console.log(`[Sandbox] Running boot test for ${serverId}`);
      await testServerBoot(serverId, game);
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      // 4. Log action
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "INSTALL_MOD",
          details: `Installed mod '${modName || modId || workshopId}' on server '${server.name}' (${server.game}).${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
        },
      });

      return NextResponse.json({
        success: true,
        message:
          dependencyCount > 0
            ? `Mod + ${dependencyCount} ${dependencyCount === 1 ? "dependency" : "dependencies"} installed successfully and passed sandbox testing.`
            : "Mod installed successfully and passed sandbox testing.",
        warnings,
        dependencyCount,
      });

    } catch (installError: any) {
      // 5. Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);

      return NextResponse.json({
        error: `Installation failed or crashed the server. Safe Rollback completed. Cause: ${installError.message}`,
        ...(installError instanceof SandboxBootError ? { bootOutput: installError.output } : {}),
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/install error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
