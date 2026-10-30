import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError, hasRealBootTest } from "@/lib/runners/sandbox";
import { dataRoot } from "@/lib/appPaths";
import fs from "fs";
import path from "path";
import {
  readLoaderMarker, detectMinecraftVersion,
  installFabricServer, installForgeServer, installNeoForgeServer, installQuiltServer,
} from "@/lib/mods/mcLoaders";
import {
  installMinecraftMod, installMinecraftCurseforge, installValheimThunderstore, installZomboidWorkshopMod,
  installVRisingThunderstore, installArkWorkshopMod, installFicsitMod, installTmlWorkshopMod, installTmlLoader,
  installPalworldThunderstore, ensureShimloaderCore,
} from "@/lib/mods/installers";
import { SHIMLOADER_PACKAGE_ID } from "@/lib/mods/palworld";
import { readTmlMarker, tmlInstallDir } from "@/lib/mods/tml";
import { installOxideCore, installRustUmodPlugin, OXIDE_CORE_PACKAGE_ID } from "@/lib/mods/umod";
import { requireLocalServer } from "@/lib/agents/perimeter";

const LOADER_LABELS: Record<string, string> = {
  fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge", tmodloader: "tModLoader",
};

// POST /api/servers/[id]/mods/import
// Body: multipart form with a `collection` JSON file (from the export route).
//
// Replays a real installation for every entry — same per-game install steps
// as single-mod installs, pinned to the exported versions — inside ONE
// snapshot -> install -> sandbox boot test -> rollback-on-failure cycle.
// No placeholder files, no "latest" guesses.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;
    requireLocalServer(server, "Mod imports");

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before importing collections." }, { status: 400 });
    }

    // Parse the FormData
    const formData = await req.formData();
    const file = formData.get("collection") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No collection file uploaded." }, { status: 400 });
    }

    let manifestRaw: any;
    try {
      manifestRaw = JSON.parse(await file.text());
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON manifest." }, { status: 400 });
    }

    const manifestSchema = z.object({
      name: z.string().optional(),
      game: z.string(),
      loader: z.object({
        type: z.enum(["fabric", "quilt", "forge", "neoforge", "tmodloader"]),
        loaderVersion: z.string(),
        minecraftVersion: z.string().optional(),
      }).optional(),
      mods: z.array(z.object({
        provider: z.enum(["workshop", "thunderstore", "modrinth", "curseforge", "umod", "ficsit"]),
        packageId: z.string().min(1),
        name: z.string().optional(),
        version: z.string().optional(),
        workshopModId: z.string().optional(),
      })).min(1).max(200),
    });
    const parsed = manifestSchema.safeParse(manifestRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Not a valid RealmSwap mod collection.", details: parsed.error.format() },
        { status: 400 }
      );
    }
    const manifest = parsed.data;

    if (manifest.game.toUpperCase() !== server.game.toUpperCase()) {
      return NextResponse.json(
        { error: `This collection is for ${manifest.game}, but your server is ${server.game}.` },
        { status: 400 }
      );
    }

    const game = server.game.toUpperCase();
    const serverRoot = path.join(dataRoot(), "local-servers", serverId);
    const warnings: string[] = [];

    // Minecraft collections may pin the loader the mods were exported against.
    if (game === "MINECRAFT" && manifest.loader) {
      const existing = readLoaderMarker(serverRoot);
      if (existing && existing.type !== manifest.loader.type) {
        const want = LOADER_LABELS[manifest.loader.type];
        const have = LOADER_LABELS[existing.type];
        return NextResponse.json(
          { error: `This collection was exported from a ${want} server, but this server runs ${have}. Restore a pre-loader snapshot first, then import.` },
          { status: 400 }
        );
      }
      if (manifest.loader.minecraftVersion) {
        const serverMc = detectMinecraftVersion(serverRoot);
        if (serverMc && serverMc !== manifest.loader.minecraftVersion) {
          warnings.push(
            `Collection was exported from Minecraft ${manifest.loader.minecraftVersion}; this server runs ${serverMc}. Mods may not be compatible.`
          );
        }
      }
    }

    // 1. Create a Snapshot before touching anything
    const snapshotName = `Pre-Import: ${manifest.name || "Mod Collection"}`;
    const snapshot = await createSnapshot(serverId, user.id, snapshotName);

    try {
      // 2. Loader first (exactly like the explicit "Install Loader" flow).
      if (game === "MINECRAFT" && manifest.loader) {        const marker = readLoaderMarker(serverRoot);
        const onLog = (msg: string) => console.log(`[Import] ${msg}`);
        if (!marker || marker.type !== manifest.loader.type) {
          const mcVersion = detectMinecraftVersion(serverRoot);
          if (!mcVersion) {
            throw new Error("Couldn't read the server's Minecraft version — install/start the server once first.");
          }
          if (manifest.loader.type === "fabric") {
            await installFabricServer(serverRoot, mcVersion, onLog);
          } else if (manifest.loader.type === "forge") {
            await installForgeServer(serverRoot, mcVersion, { pinnedVersion: manifest.loader.loaderVersion, onLog });
          } else if (manifest.loader.type === "quilt") {
            await installQuiltServer(serverRoot, mcVersion, { pinnedVersion: manifest.loader.loaderVersion, onLog });
          } else {
            await installNeoForgeServer(serverRoot, mcVersion, { pinnedVersion: manifest.loader.loaderVersion, onLog });
          }
        } else if (marker.loaderVersion !== manifest.loader.loaderVersion) {
          warnings.push(
            `Collection pins ${LOADER_LABELS[manifest.loader.type]} loader ${manifest.loader.loaderVersion}; server has ${marker.loaderVersion}.`
          );
        }
      }

      // Terraria: a collection exported from a tModLoader server replays the
      // loader first — .tmods never load under vanilla TerrariaServer.exe.
      if (game === "TERRARIA" && manifest.loader?.type === "tmodloader" && !readTmlMarker(tmlInstallDir(serverRoot))) {
        const onLog = (msg: string) => console.log(`[Import] ${msg}`);
        await installTmlLoader({ serverRoot, onLog });
      }

      // 3. Replay each mod through the same install path as single installs.
      console.log(`[Import] Starting batch import of ${manifest.mods.length} mods for server ${serverId}`);
      let dependencyCount = 0;
      for (const mod of manifest.mods) {
        if (game === "MINECRAFT") {
          // Exports carry both jar providers — replay each through its own
          // installer (CurseForge rows key by project id, Modrinth by project id too).
          if (mod.provider === "curseforge") {
            await installMinecraftCurseforge({
              serverId, installDir: serverRoot, modId: mod.packageId,
              version: mod.version, warnings,
            });
          } else if (mod.provider === "modrinth") {
            const result = await installMinecraftMod({
              serverId, installDir: serverRoot, projectId: mod.packageId,
              versionNumber: mod.version, warnings,
            });
            dependencyCount += result.dependencyCount;
          } else {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which Minecraft doesn't support.`);
          }
        } else if (game === "VALHEIM") {
          if (mod.provider !== "thunderstore") {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which Valheim doesn't support.`);
          }
          const valheimDir = path.join(serverRoot, "valheim-server");
          if (!fs.existsSync(valheimDir)) {
            throw new Error("Valheim server directory not found. Please start/install the server first.");
          }
          const result = await installValheimThunderstore({
            serverId, valheimDir, packageId: mod.packageId,
            name: mod.name, versionNumber: mod.version, warnings,
          });
          dependencyCount += result.dependencyCount;
        } else if (game === "VRISING") {
          if (mod.provider !== "thunderstore") {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which V Rising doesn't support.`);
          }
          const vrisingDir = path.join(serverRoot, "vrising-server");
          if (!fs.existsSync(vrisingDir)) {
            throw new Error("V Rising server directory not found. Please start/install the server first.");
          }
          const result = await installVRisingThunderstore({
            serverId, vrisingDir, packageId: mod.packageId,
            name: mod.name, versionNumber: mod.version, warnings,
          });
          dependencyCount += result.dependencyCount;
        } else if (game === "ZOMBOID") {
          if (mod.provider !== "workshop") {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which Project Zomboid doesn't support.`);
          }
          if (!mod.workshopModId) {
            throw new Error(
              `Collection entry '${mod.name || mod.packageId}' has no workshopModId — Zomboid mods need both the Workshop ID and the ini Mod ID.`
            );
          }
          await installZomboidWorkshopMod({
            serverId, serverRoot, workshopId: mod.packageId, modId: mod.workshopModId, name: mod.name,
          });
        } else if (game === "ARK") {
          if (mod.provider !== "workshop") {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which ARK doesn't support.`);
          }
          // The Workshop ID goes onto ActiveMods= — with -automanagemods the
          // engine downloads and updates the mod itself at boot, so import
          // is a pure ini replay.
          await installArkWorkshopMod({
            serverId, serverRoot, workshopId: mod.packageId, name: mod.name, version: mod.version,
          });
        } else if (game === "TERRARIA") {
          if (mod.provider !== "workshop") {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which Terraria doesn't support.`);
          }
          // Unlike Zomboid, no workshopModId needed: the installer derives
          // the .tmod names from the downloaded item itself.
          await installTmlWorkshopMod({
            serverId, serverRoot, workshopId: mod.packageId, name: mod.name, version: mod.version,
          });
        } else if (game === "RUST") {
          const rustDir = path.join(serverRoot, "rust-server");
          if (!fs.existsSync(path.join(rustDir, "RustDedicated_Data"))) {
            throw new Error("Rust server is not installed yet — install the server before importing plugins.");
          }
          if (mod.provider !== "umod") {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which Rust doesn't support.`);
          }
          if (mod.packageId === OXIDE_CORE_PACKAGE_ID) {
            // The framework row exports like any other — reinstall the core.
            await installOxideCore({ serverId, rustDir });
          } else {
            await installRustUmodPlugin({
              serverId, rustDir, packageId: mod.packageId, name: mod.name,
              exportedVersion: mod.version, warnings,
            });
          }
        } else if (game === "PALWORLD") {
          if (mod.provider !== "thunderstore") {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which Palworld doesn't support.`);
          }
          const palworldDir = path.join(serverRoot, "palworld-server");
          if (!fs.existsSync(palworldDir)) {
            throw new Error("Palworld server is not installed yet — install the server before importing mods.");
          }
          if (mod.packageId === SHIMLOADER_PACKAGE_ID) {
            // The framework row exports like any other — reinstall the core.
            await ensureShimloaderCore(serverId, palworldDir);
          } else {
            await installPalworldThunderstore({
              serverId, palworldDir, packageId: mod.packageId, name: mod.name, versionNumber: mod.version, warnings,
            });
          }
        } else if (game === "SATISFACTORY") {
          if (mod.provider !== "ficsit") {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which Satisfactory doesn't support.`);
          }
          const satisfactoryDir = path.join(serverRoot, "satisfactory-server");
          if (!fs.existsSync(path.join(satisfactoryDir, "FactoryServer.exe"))) {
            throw new Error("Satisfactory server is not installed yet — install the server before importing mods.");
          }
          // Collections ship the stable mod reference (the dir name); unlike
          // uMod, ficsit serves every published version, so pins install exactly.
          const result = await installFicsitMod({
            serverId, satisfactoryDir, modId: mod.packageId, versionNumber: mod.version, warnings,
          });
          dependencyCount += result.dependencyCount;
        } else {
          throw new Error(`Mod collections are not supported for game: ${server.game}`);
        }
      }

      // 4. Single Sandbox Test for the whole batch
      console.log(`[Import] Running single batch boot test for ${serverId}`);
      await testServerBoot(serverId, game);
      console.log(`[Import] Batch boot test passed for ${serverId}`);

      // 5. Log Action
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "IMPORT_MODS",
          details: `Imported Mod Collection '${manifest.name || "Mod Collection"}' (${manifest.mods.length} mods, ${dependencyCount} dependencies) on server '${server.name}'.${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Imported ${manifest.mods.length} mods${dependencyCount > 0 ? ` (+${dependencyCount} dependencies)` : ""}${hasRealBootTest(game) ? " and boot-tested them" : ""}!${warnings.length ? ` ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.` : ""}`,
        warnings,
      });

    } catch (importError: any) {
      // Automatic Rollback
      console.error(`[Import] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);

      return NextResponse.json({
        error: `Import failed or crashed the server. Safe Rollback completed. Cause: ${importError.message}`,
        ...(importError instanceof SandboxBootError ? { bootOutput: importError.output } : {}),
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST import mod collection error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
