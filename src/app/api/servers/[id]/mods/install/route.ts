import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { SandboxBootError, hasRealBootTest } from "@/lib/runners/sandbox";
import { testServerBootWithQuarantine } from "@/lib/mods/bootRetry";
import { beginProgress, emitProgress, endProgress, createBootLogEmitter } from "@/lib/mods/progress";
import { downloadFile } from "@/lib/download";
import {
  installMinecraftMod, installMinecraftCurseforge, installValheimThunderstore, installZomboidWorkshopMod,
  installArkWorkshopMod, installVRisingThunderstore, installVRisingBepInexCore,
  ensureShimloaderCore, installPalworldThunderstore,
  ensureFicsitSml, installFicsitMod,
  installTmlWorkshopMod,
} from "@/lib/mods/installers";
import { installOxideCore, installRustUmodPlugin } from "@/lib/mods/umod";
import {
  installMinecraftModRemote, installMinecraftCurseforgeRemote,
  installValheimThunderstoreRemote, installVRisingThunderstoreRemote,
  installZomboidWorkshopModRemote, installArkWorkshopModRemote,
  installOxideCoreRemote, installRustUmodPluginRemote,
  rollbackRemoteInstall, RemoteShipError,
} from "@/lib/mods/remoteInstallers";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { requireLocalServer } from "@/lib/agents/perimeter";

// POST /api/servers/[id]/mods/install
// Body: { modType: string, modId?: string, modName?: string, downloadUrl?: string, workshopId?: string }
//
// Safety contract for every install: snapshot -> install (with dependency
// resolution and loader checks on Minecraft) -> sandbox boot test -> automatic
// rollback on any failure. The per-game install steps live in
// src/lib/mods/installers.ts (shared with mod-collection import).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;
    const modInstallSchema = z.object({
      modType: z.enum(["STEAM_WORKSHOP", "MODRINTH", "CURSEFORGE", "BEPINEX", "THUNDERSTORE", "UMOD", "FICSIT"]),
      modId: z.string().optional(),
      modName: z.string().optional(),
      version: z.string().optional(),
      downloadUrl: z.string().url("Invalid download URL").optional(),
      workshopId: z.string().optional(),
      installId: z.string().regex(/^[\w-]{6,64}$/).optional(),
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
    const game = server.game.toUpperCase();
    if (server.runnerType === "AGENT") {
      return installOnAgentNode(server, game, user.id, { modType, modId, modName, version, downloadUrl, workshopId });
    }
    requireLocalServer(server, "Mod installs");

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before installing mods." }, { status: 400 });
    }

    const serverRoot = path.join(dataRoot(), "local-servers", serverId);

    // Optional live-progress session for the Mod Manager panel.
    const installId = parsed.data.installId;
    if (installId) {
      beginProgress(installId);
      emitProgress(installId, { stage: "snapshot", label: "Taking a safety snapshot" });
    }

    // 1. Create a Snapshot before touching anything
    const snapshotName = `Pre-install: ${modName || modId || workshopId}`;
    const snapshot = await createSnapshot(serverId, user.id, snapshotName);
    if (installId) emitProgress(installId, { stage: "mods", label: `Resolving and downloading ${modName || modId || workshopId}` });

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

      } else if (game === "VRISING") {
        const vrisingDir = path.join(serverRoot, "vrising-server");
        if (!fs.existsSync(vrisingDir)) {
          throw new Error("V Rising server directory not found. Please start/install the server first.");
        }

        if (modType === "BEPINEX") {
          // Core framework install only (the community's IL2CPP BepInEx 6
          // pack — the Mono zip Valheim uses would not load here).
          await installVRisingBepInexCore({ serverId, vrisingDir });
        } else {
          if (!modId) {
            throw new Error("A Thunderstore package id is required for V Rising mods.");
          }
          const result = await installVRisingThunderstore({
            serverId,
            vrisingDir,
            packageId: modId,
            name: modName,
            versionNumber: version,
            downloadUrl,
            warnings,
          });
          dependencyCount = result.dependencyCount;
        }

      } else if (game === "RUST") {
        const rustDir = path.join(serverRoot, "rust-server");
        if (!fs.existsSync(rustDir)) {
          throw new Error("Rust server is not installed yet — install the server before adding plugins.");
        }
        if (!modId) {
          // Theme-card framework install: Oxide/uMod only.
          await installOxideCore({ serverId, rustDir });
        } else {
          // A uMod plugin: its .cs source goes to Oxide/plugins/ and the
          // framework compiles it at boot.
          await installRustUmodPlugin({
            serverId, rustDir, packageId: modId, name: modName, version, downloadUrl, warnings,
          });
        }

      } else if (game === "ZOMBOID") {
        if (!fs.existsSync(path.join(serverRoot, "zomboid-server", "StartServer64.bat"))) {
          throw new Error("Project Zomboid server is not installed yet — install the server before adding mods.");
        }
        if (!workshopId) {
          throw new Error("A Workshop ID is required for Project Zomboid mods.");
        }
        // Without a modId the installer downloads the item via SteamCMD and
        // derives the ini mod IDs from its mod.info files.
        await installZomboidWorkshopMod({
          serverId, serverRoot, workshopId, modId, name: modName, version,
        });

      } else if (game === "ARK") {
        if (!fs.existsSync(path.join(serverRoot, "ark-server", "ShooterGame"))) {
          throw new Error("ARK server is not installed yet — install the server before adding mods.");
        }
        if (!workshopId) {
          throw new Error("A Workshop ID is required for ARK mods.");
        }
        // The Workshop ID goes straight onto ActiveMods= — the server
        // downloads and updates the mod itself (-automanagemods).
        await installArkWorkshopMod({
          serverId, serverRoot, workshopId, name: modName, version,
        });

      } else if (game === "TERRARIA") {
        if (!workshopId) {
          throw new Error("A Workshop ID is required for tModLoader mods.");
        }
        // SteamCMD-downloads the item into the tML install's workshop dir and
        // enables its .tmod names; requires the tModLoader loader first.
        await installTmlWorkshopMod({
          serverId, serverRoot, workshopId, name: modName, version,
        });

      } else if (game === "PALWORLD") {
        const palworldDir = path.join(serverRoot, "palworld-server");
        if (!fs.existsSync(palworldDir)) {
          throw new Error("Palworld server is not installed yet — install the server before adding mods.");
        }
        if (!modId) {
          // Theme-card framework install: shimloader/UE4SS only.
          await ensureShimloaderCore(serverId, palworldDir);
        } else {
          await installPalworldThunderstore({
            serverId, palworldDir, packageId: modId, name: modName, versionNumber: version, downloadUrl, warnings,
          });
        }

      } else if (game === "SATISFACTORY") {
        const satisfactoryDir = path.join(serverRoot, "satisfactory-server");
        if (!fs.existsSync(path.join(satisfactoryDir, "FactoryServer.exe"))) {
          throw new Error("Satisfactory server is not installed yet — install the server before adding mods.");
        }
        if (!modId) {
          // Theme-card framework install: SML only.
          await ensureFicsitSml(serverId, satisfactoryDir, warnings);
        } else {
          const result = await installFicsitMod({ serverId, satisfactoryDir, modId, versionNumber: version, warnings });
          dependencyCount = result.dependencyCount;
        }

      } else {
        throw new Error(`Mods are not supported for game: ${server.game}`);
      }

      // 3. Sandbox Test
      console.log(`[Sandbox] Running boot test for ${serverId}`);
      const bootsForReal = hasRealBootTest(game);
      if (installId && bootsForReal) emitProgress(installId, { stage: "boot", label: "Booting the server once to verify the install", current: 0, total: 1 });
      const bootLog = createBootLogEmitter(installId);
      const quarantined = await testServerBootWithQuarantine({
        serverId, serverRoot, game, warnings,
        // Non-MC games get delta-quarantine: if the boot crashes, the mods
        // this install just added are removed and the boot retried (see
        // bootRetry). MC runs its own crash-report blame loop instead.
        blame: game === "MINECRAFT" ? undefined : [modId, workshopId].filter((x): x is string => !!x),
        onProgress: (lbl) => { console.log(`[Sandbox] ${lbl}`); if (installId) emitProgress(installId, { label: lbl }); },
        onBootLine: bootLog,
      });
      // Quarantined jars' install rows are keyed by jar basename — drop them
      // so the Installed list doesn't resurrect what the boot test removed.
      for (const name of quarantined) {
        await prisma.modInstallation.deleteMany({ where: { serverId, packageId: name.replace(/\.jar$/, "") } });
      }
      if (installId) emitProgress(installId, { current: 1 });
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      // 4. Log action
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "INSTALL_MOD",
          details: `Installed mod '${modName || modId || workshopId}' on server '${server.name}' (${server.game}).${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
        },
      });

      if (installId) endProgress(installId, "done");
      // Only claim the boot test for games the sandbox actually boots.
      const tested = bootsForReal ? " and passed sandbox testing" : "";
      return NextResponse.json({
        success: true,
        message:
          dependencyCount > 0
            ? `Mod + ${dependencyCount} ${dependencyCount === 1 ? "dependency" : "dependencies"} installed successfully${tested}.`
            : `Mod installed successfully${tested}.`,
        warnings,
        dependencyCount,
      });

    } catch (installError: any) {
      // 5. Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      if (installId) emitProgress(installId, { label: "Install failed — rolling back safely" });
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);
      if (installId) endProgress(installId, "error", installError.message);

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

/**
 * The AGENT-server install path. Same providers and resolution as the local
 * flow, but files land on the node via the mod-ship tar (the node tar-asides
 * the affected paths first, which is the rollback), and there is NO sandbox
 * boot test — the game files live on a machine this process can't spawn. The
 * response says so instead of claiming sandbox testing happened.
 */
async function installOnAgentNode(
  server: { id: string; name: string; game: string; status: string },
  game: string,
  userId: string,
  input: { modType: string; modId?: string; modName?: string; version?: string; downloadUrl?: string; workshopId?: string }
) {
  const { modType, modId, modName, version, downloadUrl, workshopId } = input;
  const serverId = server.id;

  if (server.status === "RUNNING" || server.status === "STARTING") {
    return NextResponse.json({ error: "Please stop the server before installing mods." }, { status: 400 });
  }

  const warnings: string[] = [];
  let dependencyCount = 0;

  try {
    if (game === "MINECRAFT") {
      if (!modId) throw new Error("A Modrinth project id or CurseForge mod id is required for Minecraft mods.");
      const result = modType === "CURSEFORGE"
        ? await installMinecraftCurseforgeRemote({ serverId, modId, version, warnings })
        : await installMinecraftModRemote({ serverId, projectId: modId, versionNumber: version, warnings });
      dependencyCount = result.dependencyCount;
    } else if (game === "VALHEIM" || game === "VRISING") {
      if (modType === "BEPINEX") {
        // Core-only install = install the game's core pack as the package.
        const coreId = game === "VALHEIM" ? "denikson-BepInExPack_Valheim" : "BepInEx-BepInExPack_V_Rising";
        const installer = game === "VALHEIM" ? installValheimThunderstoreRemote : installVRisingThunderstoreRemote;
        await installer({ serverId, packageId: coreId, name: "BepInEx", warnings });
      } else {
        if (!modId) throw new Error(`A Thunderstore package id is required for ${game === "VALHEIM" ? "Valheim" : "V Rising"} mods.`);
        const installer = game === "VALHEIM" ? installValheimThunderstoreRemote : installVRisingThunderstoreRemote;
        const result = await installer({ serverId, packageId: modId, name: modName, versionNumber: version, downloadUrl, warnings });
        dependencyCount = result.dependencyCount;
      }
    } else if (game === "RUST") {
      if (!modId) {
        await installOxideCoreRemote({ serverId });
      } else {
        await installRustUmodPluginRemote({ serverId, packageId: modId, name: modName, version, downloadUrl, warnings });
      }
    } else if (game === "ZOMBOID") {
      if (!workshopId) throw new Error("A Workshop ID is required for Project Zomboid mods.");
      await installZomboidWorkshopModRemote({ serverId, workshopId, modId, name: modName, version });
    } else if (game === "ARK") {
      if (!workshopId) throw new Error("A Workshop ID is required for ARK mods.");
      await installArkWorkshopModRemote({ serverId, workshopId, name: modName, version });
    } else {
      throw new Error(`'${server.game}' mods aren't supported on remote-node servers yet.`);
    }

    await prisma.activityLog.create({
      data: {
        userId,
        action: "INSTALL_MOD",
        details: `Installed mod '${modName || modId || workshopId}' on node server '${server.name}' (${server.game}).${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        dependencyCount > 0
          ? `Mod + ${dependencyCount} ${dependencyCount === 1 ? "dependency" : "dependencies"} installed on the node. (Remote nodes skip the sandbox boot test — watch the first start in the console.)`
          : `Mod installed on the node. (Remote nodes skip the sandbox boot test — watch the first start in the console.)`,
      warnings,
      dependencyCount,
    });
  } catch (installError: any) {
    // The node holds a tar of the touched paths when its apply got far
    // enough — overlay the pre-install versions back.
    if (installError instanceof RemoteShipError) {
      await rollbackRemoteInstall(serverId, installError).catch(() => {});
      return NextResponse.json({
        error: `Installation failed on the node. Rollback completed. Cause: ${installError.message}`,
      }, { status: 500 });
    }
    return NextResponse.json({
      error: `Installation failed. Cause: ${installError.message}`,
    }, { status: 500 });
  }
}
