import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { createSnapshot, restoreSnapshot } from "@/lib/snapshots";
import { testServerBoot } from "@/lib/runners/sandbox";
import { dataRoot } from "@/lib/appPaths";
import fs from "fs";
import path from "path";
import {
  readLoaderMarker, detectMinecraftVersion,
  installFabricServer, installForgeServer, installNeoForgeServer, installQuiltServer,
} from "@/lib/mods/mcLoaders";
import {
  installMinecraftMod, installValheimThunderstore, installZomboidWorkshopMod,
} from "@/lib/mods/installers";

const LOADER_LABELS: Record<string, string> = {
  fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge",
};

// POST /api/servers/[id]/mods/import
// Body: multipart form with a `collection` JSON file (from the export route).
//
// Replays a real installation for every entry — same per-game install steps
// as single-mod installs, pinned to the exported versions — inside ONE
// snapshot -> install -> sandbox boot test -> rollback-on-failure cycle.
// No placeholder files, no "latest" guesses.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
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
        type: z.enum(["fabric", "quilt", "forge", "neoforge"]),
        loaderVersion: z.string(),
        minecraftVersion: z.string().optional(),
      }).optional(),
      mods: z.array(z.object({
        provider: z.enum(["workshop", "thunderstore", "modrinth"]),
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
      if (game === "MINECRAFT" && manifest.loader) {
        const marker = readLoaderMarker(serverRoot);
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

      // 3. Replay each mod through the same install path as single installs.
      console.log(`[Import] Starting batch import of ${manifest.mods.length} mods for server ${serverId}`);
      let dependencyCount = 0;
      for (const mod of manifest.mods) {
        if (game === "MINECRAFT") {
          if (mod.provider !== "modrinth") {
            throw new Error(`Collection entry '${mod.packageId}' uses provider '${mod.provider}', which Minecraft doesn't support.`);
          }
          const result = await installMinecraftMod({
            serverId, installDir: serverRoot, projectId: mod.packageId,
            versionNumber: mod.version, warnings,
          });
          dependencyCount += result.dependencyCount;
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
        message: `Imported and tested ${manifest.mods.length} mods${dependencyCount > 0 ? ` (+${dependencyCount} dependencies)` : ""}!${warnings.length ? ` ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.` : ""}`,
        warnings,
      });

    } catch (importError: any) {
      // Automatic Rollback
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
