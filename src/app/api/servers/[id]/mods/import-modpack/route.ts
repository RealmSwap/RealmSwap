import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { prisma } from "@/lib/db";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { createSnapshot, restoreSnapshot } from "@/lib/snapshots";
import { testServerBoot } from "@/lib/runners/sandbox";
import { downloadFile } from "@/lib/download";
import {
  readLoaderMarker, detectMinecraftVersion,
  installFabricServer, installForgeServer, installNeoForgeServer,
} from "@/lib/mods/mcLoaders";
import {
  readMrpackIndex, safePackPath, selectServerFiles, verifyFileHash,
  extractMrpackOverrides, loaderRequirement,
} from "@/lib/mods/mrpack";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

// POST /api/servers/[id]/mods/import-modpack
// Body: multipart form with a `modpack` file in Modrinth .mrpack format.
//
// Same safety contract as single-mod installs: snapshot -> download + hash
// verify every manifest file -> apply overrides -> sandbox boot test ->
// automatic rollback on any failure. Packs pinning Forge or Quilt loaders are
// refused with a clear error rather than installed broken.
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

    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before importing a modpack." }, { status: 400 });
    }

    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Modpack import (.mrpack) is only supported for Minecraft servers." }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("modpack") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No modpack file provided" }, { status: 400 });
    }

    // Parse and pre-flight before spending a snapshot, so invalid packs fail
    // without touching the server at all.
    const zip = new AdmZip(Buffer.from(await file.arrayBuffer()));
    let index;
    try {
      index = readMrpackIndex(zip);
    } catch (parseError: any) {
      return NextResponse.json({ error: parseError.message }, { status: 400 });
    }

    const serverRoot = path.join(dataRoot(), "local-servers", serverId);

    const serverMcVersion = detectMinecraftVersion(serverRoot);
    if (!serverMcVersion) {
      return NextResponse.json(
        { error: "No server.jar found — install the Minecraft server before importing a modpack." },
        { status: 400 }
      );
    }

    const packMcVersion = index.dependencies?.["minecraft"];
    if (packMcVersion && packMcVersion !== serverMcVersion) {
      return NextResponse.json(
        { error: `This pack targets Minecraft ${packMcVersion}, but the server runs ${serverMcVersion}.` },
        { status: 400 }
      );
    }

    const loader = loaderRequirement(index);
    if (loader?.type === "quilt") {
      return NextResponse.json(
        { error: `This pack requires the Quilt loader (v${loader.version}). Quilt server installation isn't supported yet.` },
        { status: 400 }
      );
    }
    if (loader) {
      const existing = readLoaderMarker(serverRoot);
      if (existing && existing.type !== loader.type) {
        const want = loader.type === "neoforge" ? "NeoForge" : loader.type === "forge" ? "Forge" : "Fabric";
        const have = existing.type === "neoforge" ? "NeoForge" : existing.type === "forge" ? "Forge" : "Fabric";
        return NextResponse.json(
          { error: `This pack requires the ${want} loader, but the server already runs ${have}. Import it onto a vanilla server (or one already running ${want}).` },
          { status: 400 }
        );
      }
    }

    const snapshotName = `Pre-modpack: ${index.name}`;
    const snapshot = await createSnapshot(serverId, user.id, snapshotName);

    const warnings: string[] = [];

    try {
      // Packs that pin a loader: install it first, exactly like the explicit
      // "Install Loader" flow (Quilt packs were refused in pre-flight above).
      if (loader) {
        const marker = readLoaderMarker(serverRoot);
        if (!marker || marker.type !== loader.type) {
          const onLog = (msg: string) => console.log(`[Modpack] ${msg}`);
          if (loader.type === "fabric") {
            await installFabricServer(serverRoot, serverMcVersion, onLog);
          } else if (loader.type === "forge") {
            await installForgeServer(serverRoot, serverMcVersion, { pinnedVersion: loader.version, onLog });
          } else {
            await installNeoForgeServer(serverRoot, serverMcVersion, { pinnedVersion: loader.version, onLog });
          }
        } else if (marker.loaderVersion !== loader.version) {
          const name = loader.type === "neoforge" ? "NeoForge" : loader.type === "forge" ? "Forge" : "Fabric";
          warnings.push(`Pack pins ${name} loader ${loader.version}; server has ${marker.loaderVersion}.`);
        }
      }

      const { install, clientOnly, optional } = selectServerFiles(index.files);

      if (!loader && install.some((f) => f.path.startsWith("mods/"))) {
        warnings.push("Pack declares no mod loader — its mods/ jars will not load on a vanilla server.");
      }

      let installedCount = 0;
      for (const manifestFile of install) {
        const rel = safePackPath(manifestFile.path);
        const dest = safeJoin(serverRoot, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });

        // Try each mirror in order until one downloads AND passes the hash check.
        let downloaded = false;
        let lastError: any = null;
        for (const url of manifestFile.downloads ?? []) {
          try {
            await downloadFile(url, dest);
            if (!verifyFileHash(fs.readFileSync(dest), manifestFile.hashes ?? {})) {
              throw new Error("hash mismatch after download");
            }
            downloaded = true;
            break;
          } catch (err: any) {
            lastError = err;
            try { fs.unlinkSync(dest); } catch (_) {}
          }
        }
        if (!downloaded) {
          throw new Error(
            `Could not fetch '${manifestFile.path}' from the pack's mirrors (${lastError?.message ?? "no download URLs"}).`
          );
        }

        // Jar mods get ModInstallation rows so the Installed Mods list and the
        // uninstall flow cover them; pack support files (configs, datapacks…)
        // are reverted via snapshot only.
        if (rel.startsWith(`mods${path.sep}`) && rel.endsWith(".jar")) {
          const packageId = path.basename(rel, ".jar");
          await prisma.modInstallation.upsert({
            where: { serverId_provider_packageId: { serverId, provider: "modrinth", packageId } },
            update: { version: index.versionId },
            create: {
              serverId, provider: "modrinth", packageId,
              version: index.versionId, name: packageId,
            },
          });
        }
        installedCount++;
      }

      // Overrides go on last so pack-provided files win over manifest downloads.
      const overridesCount = extractMrpackOverrides(zip, serverRoot);

      if (optional.length > 0) {
        warnings.push(`${optional.length} file(s) are optional on the server side — installed anyway.`);
      }

      // 3. Sandbox Test
      console.log(`[Sandbox] Running boot test for ${serverId}`);
      await testServerBoot(serverId, "MINECRAFT");
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      // 4. Log action
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "INSTALL_MODPACK",
          details: `Imported modpack '${index.name}' (${index.versionId}) onto server '${server.name}': ${installedCount} files installed, ${clientOnly.length} client-only skipped, ${overridesCount} overrides applied.${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
        },
      });

      const message =
        `Imported '${index.name}' (${index.versionId}): ${installedCount} files installed, ` +
        `${clientOnly.length} client-only skipped, ${overridesCount} overrides applied.` +
        (warnings.length ? ` Warnings: ${warnings.join(" ")}` : "");

      return NextResponse.json({ success: true, message, warnings });

    } catch (installError: any) {
      // 5. Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
      await prisma.serverSnapshot.delete({ where: { id: snapshot.id } });

      return NextResponse.json({
        error: `Modpack import failed. Safe Rollback completed. Cause: ${installError.message}`
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/import-modpack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
