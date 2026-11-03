import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError, hasRealBootTest } from "@/lib/runners/sandbox";
import { dataRoot } from "@/lib/appPaths";
import path from "path";
import {
  checkLoaderConflict, installPinnedLoader, replayMods, ReplayLoaderRef,
} from "@/lib/mods/replayCollection";
import { detectMinecraftVersion } from "@/lib/mods/mcLoaders";
import { requireLocalServer } from "@/lib/agents/perimeter";

// POST /api/servers/[id]/mods/import
// Body: multipart form with a `collection` JSON file (from the export route).
//
// Replays a real installation for every entry — same per-game install steps
// as single-mod installs, pinned to the exported versions — inside ONE
// snapshot -> install -> sandbox boot test -> rollback-on-failure cycle.
// No placeholder files, no "latest" guesses. The per-game replay itself lives
// in lib/mods/replayCollection.ts (shared with realm materialization).
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
        // The app's own export route emits workshopModId: null for every
        // non-workshop row — a null-intolerant schema here broke the
        // export→import round trip for all of those collections.
        workshopModId: z.string().nullish(),
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
    // A mismatch would flip the server's loader — refuse before any snapshot.
    const loaderConflict = checkLoaderConflict(game, serverRoot, manifest.loader ?? null);
    if (loaderConflict) {
      return NextResponse.json({ error: loaderConflict }, { status: 400 });
    }
    if (game === "MINECRAFT" && manifest.loader?.minecraftVersion) {
      const serverMc = detectMinecraftVersion(serverRoot);
      if (serverMc && serverMc !== manifest.loader.minecraftVersion) {
        warnings.push(
          `Collection was exported from Minecraft ${manifest.loader.minecraftVersion}; this server runs ${serverMc}. Mods may not be compatible.`
        );
      }
    }

    // 1. Create a Snapshot before touching anything
    const snapshotName = `Pre-Import: ${manifest.name || "Mod Collection"}`;
    const snapshot = await createSnapshot(serverId, user.id, snapshotName);

    try {
      // 2. Loader first (exactly like the explicit "Install Loader" flow).
      const onLog = (msg: string) => console.log(`[Import] ${msg}`);
      if (manifest.loader) {
        await installPinnedLoader(game, serverRoot, manifest.loader as ReplayLoaderRef, warnings, onLog);
      }

      // 3. Replay each mod through the same install path as single installs.
      console.log(`[Import] Starting batch import of ${manifest.mods.length} mods for server ${serverId}`);
      const dependencyCount = await replayMods({
        game, serverId, serverRoot,
        loader: null, // loader already installed above
        mods: manifest.mods,
        warnings,
        onLog,
      });

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
