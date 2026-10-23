import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { createSnapshot, restoreSnapshot } from "@/lib/snapshots";
import { testServerBoot } from "@/lib/runners/sandbox";
import { downloadFile } from "@/lib/download";
import {
  readLoaderMarker, detectMinecraftVersion, detectModLoader,
} from "@/lib/mods/mcLoaders";
import {
  resolveInstallCandidate, fetchVersions, pickCompatibleVersion, primaryFile,
} from "@/lib/mods/modrinth";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

// POST /api/servers/[id]/mods/install
// Body: { modType: string, modId?: string, modName?: string, downloadUrl?: string, workshopId?: string }
//
// Safety contract for every install: snapshot -> install (with dependency
// resolution and loader checks on Minecraft) -> sandbox boot test -> automatic
// rollback on any failure.
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

    try {
      // 2. Perform Installation
      if (game === "MINECRAFT") {
        if (!modId) {
          throw new Error("A Modrinth project id/slug is required for Minecraft mods.");
        }

        const installDir = serverRoot; // Minecraft installs live at the server root
        const modsDir = path.join(installDir, "mods");
        if (!fs.existsSync(modsDir)) {
          fs.mkdirSync(modsDir, { recursive: true });
        }

        // Resolve against what this server actually runs: its Minecraft
        // version and installed loader (if any).
        const marker = readLoaderMarker(installDir);
        const gameVersion = detectMinecraftVersion(installDir);
        const loader = marker?.type ?? null;

        const candidate = await resolveInstallCandidate(modId, { gameVersion, loader });

        // Client-only mods are a silent no-op on a server — refuse loudly.
        if (candidate.project.server_side === "unsupported") {
          throw new Error(
            `'${candidate.project.title}' is a client-side mod — it cannot run on a server.`
          );
        }
        if (candidate.project.server_side === "optional") {
          warnings.push(
            `'${candidate.project.title}' is primarily a client mod; the server-side part may be optional.`
          );
        }

        // Required dependencies first (BFS over the Modrinth graph).
        const installedProjectIds = new Set(
          (await prisma.modInstallation.findMany({ where: { serverId }, select: { packageId: true } }))
            .map((m) => m.packageId)
        );
        // Required dependencies first: async BFS over the Modrinth graph,
        // skipping anything already installed. Unresolvable deps warn, not fail.
        const toInstall: { projectId: string; title: string; versionNumber: string; url: string; filename: string }[] = [];
        const seen = new Set<string>([candidate.version.project_id]);
        let level: any[] = [candidate.version];
        for (let depth = 0; level.length > 0 && depth < 12; depth++) {
          const next: any[] = [];
          for (const version of level) {
            for (const dep of version.dependencies ?? []) {
              if (dep.dependency_type !== "required") continue;
              if (seen.has(dep.project_id)) continue;
              seen.add(dep.project_id);
              if (installedProjectIds.has(dep.project_id)) continue;
              const depVersions = await fetchVersions(dep.project_id);
              const depVersion = pickCompatibleVersion(depVersions, { gameVersion, loader });
              const depFile = depVersion ? primaryFile(depVersion) : null;
              if (!depVersion || !depFile) {
                warnings.push(
                  `Dependency ${dep.project_id} has no compatible version${gameVersion ? ` for Minecraft ${gameVersion}` : ""} — the mod may not work without it.`
                );
                continue;
              }
              toInstall.push({
                projectId: dep.project_id,
                title: dep.project_id,
                versionNumber: depVersion.version_number,
                url: depFile.url,
                filename: depFile.filename,
              });
              next.push(depVersion);
            }
          }
          level = next;
        }
        for (const dep of toInstall) {
          const dest = safeJoin(modsDir, `${dep.projectId}.jar`);
          await downloadFile(dep.url, dest);
          await prisma.modInstallation.upsert({
            where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId: dep.projectId } },
            update: { version: dep.versionNumber },
            create: {
              serverId, provider: "modrinth", packageId: dep.projectId,
              version: dep.versionNumber, name: dep.title,
            },
          });
        }

        // Main mod: download to a temp location first so we can inspect the jar.
        const tempJar = safeJoin(modsDir, `.staging-${Date.now()}.jar`);
        await downloadFile(candidate.file.url, tempJar);

        const needsLoader = detectModLoader(tempJar);
        if (needsLoader) {
          // NeoForge also loads jars whose manifest is the legacy Forge
          // META-INF/mods.toml, so a neoforge server satisfies "forge" mods.
          const satisfied =
            !!marker &&
            (marker.type === needsLoader || (marker.type === "neoforge" && needsLoader === "forge"));
          if (!satisfied) {
            fs.unlinkSync(tempJar);
            const where =
              needsLoader === "quilt"
                ? "Quilt loader installation isn't supported yet."
                : `Install ${needsLoader === "neoforge" ? "NeoForge" : needsLoader} first (Installed tab → Install Loader).`;
            throw new Error(
              `'${candidate.project.title}' requires the ${needsLoader} loader, which isn't installed on this server. ${where}`
            );
          }
        }

        const destPath = safeJoin(modsDir, `${candidate.project.id}.jar`);
        fs.renameSync(tempJar, destPath);

        await prisma.modInstallation.upsert({
          where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId: candidate.project.id } },
          update: {
            version: candidate.version.version_number,
            name: candidate.project.title,
            dependencies: JSON.stringify(toInstall.map((d) => d.projectId)),
          },
          create: {
            serverId, provider: "modrinth", packageId: candidate.project.id,
            version: candidate.version.version_number, name: candidate.project.title,
            dependencies: JSON.stringify(toInstall.map((d) => d.projectId)),
          },
        });

      } else if (game === "VALHEIM") {
        if (modType === "BEPINEX") {
          const valheimDir = path.join(serverRoot, "valheim-server");
          const zipPath = path.join(serverRoot, "bepinex.zip");
          const defaultBepInExUrl = "https://github.com/BepInEx/BepInEx/releases/download/v5.4.22/BepInEx_x64_5.4.22.0.zip";

          if (!fs.existsSync(valheimDir)) {
            throw new Error("Valheim server directory not found. Please start/install the server first.");
          }

          await downloadFile(defaultBepInExUrl, zipPath);
          try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(valheimDir, true);
            try { fs.unlinkSync(zipPath); } catch (_) {}
          } catch (err: any) {
            throw new Error(`Failed to extract BepInEx: ${err.message}`);
          }
        } else {
          if (!downloadUrl) {
            throw new Error("Download URL is required for Valheim plugins.");
          }
          const valheimDir = path.join(serverRoot, "valheim-server");
          const bepinexCheckFile = path.join(valheimDir, "doorstop_config.ini");

          if (!fs.existsSync(bepinexCheckFile)) {
            console.log(`[Sandbox] BepInEx not found for server ${serverId}. Auto-installing core framework first...`);
            const zipPath = path.join(serverRoot, "bepinex.zip");
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

          // Thunderstore packages ship as zips; extract into a per-mod folder.
          if (downloadUrl.endsWith(".zip")) {
            const tempZip = safeJoin(pluginsDir, `${modId}.zip`);
            await downloadFile(downloadUrl, tempZip);
            try {
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

        const serverConfigDir = path.join(serverRoot, "zomboid-server", "zomboid-data", "Server");
        if (!fs.existsSync(serverConfigDir)) {
          fs.mkdirSync(serverConfigDir, { recursive: true });
        }

        const iniPath = path.join(serverConfigDir, "servertest.ini");
        let iniContent = "";
        if (fs.existsSync(iniPath)) {
          iniContent = fs.readFileSync(iniPath, "utf-8");
        }

        const workshopRegex = /^WorkshopItems=(.*)$/m;
        const workshopMatch = iniContent.match(workshopRegex);
        if (workshopMatch) {
          const currentItems = workshopMatch[1].trim();
          if (!currentItems.includes(workshopId)) {
            const newItems = currentItems ? `${currentItems};${workshopId}` : workshopId;
            iniContent = iniContent.replace(workshopRegex, `WorkshopItems=${newItems}`);
          }
        } else {
          iniContent += `\nWorkshopItems=${workshopId}\n`;
        }

        const modsRegex = /^Mods=(.*)$/m;
        const modsMatch = iniContent.match(modsRegex);
        if (modsMatch) {
          const currentMods = modsMatch[1].trim();
          if (!currentMods.includes(modId)) {
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
        message: "Mod installed successfully and passed sandbox testing.",
        warnings,
      });

    } catch (installError: any) {
      // 5. Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
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
