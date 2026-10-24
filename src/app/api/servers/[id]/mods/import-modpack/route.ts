import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { prisma } from "@/lib/db";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { downloadFile } from "@/lib/download";
import {
  readLoaderMarker, detectMinecraftVersion,
  installFabricServer, installForgeServer, installNeoForgeServer, installQuiltServer,
} from "@/lib/mods/mcLoaders";
import {
  readMrpackIndex, safePackPath, selectServerFiles, verifyFileHash,
  extractMrpackOverrides, loaderRequirement, type MrpackIndex,
} from "@/lib/mods/mrpack";
import {
  readCurseForgeManifest, cfLoaderRequirement, cfOverridesPrefix, resolveCfPackFiles,
  curseForgeDownloadUrl, curseForgeSha1, type CfManifest,
} from "@/lib/mods/curseforge";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

const LOADER_LABELS: Record<string, string> = {
  fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge",
};

// POST /api/servers/[id]/mods/import-modpack
// Body: multipart form with a `modpack` file in Modrinth .mrpack format or
// CurseForge manifest.json format (resolved through the CurseForge API).
//
// Same safety contract for both formats: snapshot -> download + hash verify
// every manifest file -> apply overrides -> sandbox boot test -> automatic
// rollback on any failure. CurseForge file resolution happens BEFORE the
// snapshot so network/distribution failures cost nothing.
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
      return NextResponse.json({ error: "Modpack import is only supported for Minecraft servers." }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("modpack") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No modpack file provided" }, { status: 400 });
    }

    const serverRoot = path.join(dataRoot(), "local-servers", serverId);

    const serverMcVersion = detectMinecraftVersion(serverRoot);
    if (!serverMcVersion) {
      return NextResponse.json(
        { error: "No server.jar found — install the Minecraft server before importing a modpack." },
        { status: 400 }
      );
    }

    // Parse and pre-flight before spending a snapshot, so invalid packs fail
    // without touching the server at all. CurseForge packs are detected by
    // their manifest.json; everything else goes down the .mrpack path.
    const zip = new AdmZip(Buffer.from(await file.arrayBuffer()));
    const isCurseForgePack = !!zip.getEntry("manifest.json");

    let mrpackIndex: MrpackIndex | null = null;
    let cfManifest: CfManifest | null = null;
    let cfPlan: Awaited<ReturnType<typeof resolveCfPackFiles>> | null = null;
    let packMcVersion: string | undefined;
    let packLoader: { type: "fabric" | "quilt" | "forge" | "neoforge"; version: string } | null = null;
    let overridesPrefixes: string[] = ["overrides/", "server-overrides/"];

    try {
      if (isCurseForgePack) {
        cfManifest = readCurseForgeManifest(zip);
        packMcVersion = cfManifest.minecraft.version;
        packLoader = cfLoaderRequirement(cfManifest);
        overridesPrefixes = [cfOverridesPrefix(cfManifest)];
        // Resolve every file's metadata (and the distribution + hash gates)
        // from the CurseForge API now — before a snapshot exists to waste.
        cfPlan = await resolveCfPackFiles(cfManifest);
      } else {
        mrpackIndex = readMrpackIndex(zip);
        packMcVersion = mrpackIndex.dependencies?.["minecraft"];
        packLoader = loaderRequirement(mrpackIndex);
      }
    } catch (parseError: any) {
      return NextResponse.json({ error: parseError.message }, { status: 400 });
    }

    if (packMcVersion && packMcVersion !== serverMcVersion) {
      return NextResponse.json(
        { error: `This pack targets Minecraft ${packMcVersion}, but the server runs ${serverMcVersion}.` },
        { status: 400 }
      );
    }

    if (packLoader) {
      const existing = readLoaderMarker(serverRoot);
      if (existing && existing.type !== packLoader.type) {
        const want = LOADER_LABELS[packLoader.type];
        const have = LOADER_LABELS[existing.type];
        return NextResponse.json(
          { error: `This pack requires the ${want} loader, but the server already runs ${have}. Import it onto a vanilla server (or one already running ${want}).` },
          { status: 400 }
        );
      }
    }

    const packName = cfManifest?.name ?? mrpackIndex?.name ?? "modpack";
    const packVersion = cfManifest?.version ?? mrpackIndex?.versionId ?? "unknown";
    const snapshotName = `Pre-modpack: ${packName}`;
    const snapshot = await createSnapshot(serverId, user.id, snapshotName);

    const warnings: string[] = [];

    try {
      // Packs that pin a loader: install it first, exactly like the explicit
      // "Install Loader" flow.
      if (packLoader) {
        const marker = readLoaderMarker(serverRoot);
        if (!marker || marker.type !== packLoader.type) {
          const onLog = (msg: string) => console.log(`[Modpack] ${msg}`);
          if (packLoader.type === "fabric") {
            await installFabricServer(serverRoot, serverMcVersion, onLog);
          } else if (packLoader.type === "forge") {
            await installForgeServer(serverRoot, serverMcVersion, { pinnedVersion: packLoader.version, onLog });
          } else if (packLoader.type === "quilt") {
            await installQuiltServer(serverRoot, serverMcVersion, { pinnedVersion: packLoader.version, onLog });
          } else {
            await installNeoForgeServer(serverRoot, serverMcVersion, { pinnedVersion: packLoader.version, onLog });
          }
        } else if (marker.loaderVersion !== packLoader.version) {
          warnings.push(`Pack pins ${LOADER_LABELS[packLoader.type]} loader ${packLoader.version}; server has ${marker.loaderVersion}.`);
        }
      }

      let installedCount = 0;
      let clientOnlyCount = 0;

      if (cfPlan && cfManifest) {
        const modsDir = path.join(serverRoot, "mods");
        fs.mkdirSync(modsDir, { recursive: true });

        if (!packLoader && cfPlan.files.length > 0) {
          warnings.push("Pack pins no mod loader — its mods/ jars will not load on a vanilla server.");
        }

        for (const cfFile of cfPlan.files) {
          // Jars are normalized to mods/<projectId>.jar so installs, updates,
          // uninstall and disk reconcile all share one keying convention.
          const dest = safeJoin(modsDir, `${cfFile.modId}.jar`);
          await downloadFile(curseForgeDownloadUrl(cfFile), dest);
          const actual = fs.readFileSync(dest);
          if (!verifyFileHash(actual, { sha1: curseForgeSha1(cfFile)! })) {
            fs.unlinkSync(dest);
            throw new Error(`sha1 mismatch for '${cfFile.displayName}' — the download doesn't match what CurseForge reports.`);
          }
          await prisma.modInstallation.upsert({
            where: { serverId_provider_packageId: { serverId, provider: "curseforge", packageId: String(cfFile.modId) } },
            update: { version: cfFile.displayName, name: cfPlan.modNames.get(cfFile.modId) || cfFile.fileName },
            create: {
              serverId, provider: "curseforge", packageId: String(cfFile.modId),
              version: cfFile.displayName, name: cfPlan.modNames.get(cfFile.modId) || cfFile.fileName,
            },
          });
          installedCount++;
        }

        if (cfPlan.skippedOptional > 0) {
          clientOnlyCount = cfPlan.skippedOptional;
          warnings.push(`${cfPlan.skippedOptional} optional file(s) skipped — CurseForge marks them non-required (usually client-side).`);
        }
      } else if (mrpackIndex) {
        const { install, clientOnly, optional } = selectServerFiles(mrpackIndex.files);
        clientOnlyCount = clientOnly.length;

        if (!packLoader && install.some((f) => f.path.startsWith("mods/"))) {
          warnings.push("Pack declares no mod loader — its mods/ jars will not load on a vanilla server.");
        }

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
              update: { version: packVersion },
              create: {
                serverId, provider: "modrinth", packageId,
                version: packVersion, name: packageId,
              },
            });
          }
          installedCount++;
        }

        if (optional.length > 0) {
          warnings.push(`${optional.length} file(s) are optional on the server side — installed anyway.`);
        }
      }

      // Overrides go on last so pack-provided files win over manifest downloads.
      const overridesCount = extractMrpackOverrides(zip, serverRoot, overridesPrefixes);

      // 3. Sandbox Test
      console.log(`[Sandbox] Running boot test for ${serverId}`);
      await testServerBoot(serverId, "MINECRAFT");
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      // 4. Log action
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "INSTALL_MODPACK",
          details: `Imported ${isCurseForgePack ? "CurseForge " : ""}modpack '${packName}' (${packVersion}) onto server '${server.name}': ${installedCount} files installed, ${clientOnlyCount} client-only skipped, ${overridesCount} overrides applied.${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
        },
      });

      const message =
        `Imported '${packName}' (${packVersion}): ${installedCount} files installed, ` +
        `${clientOnlyCount} client-only skipped, ${overridesCount} overrides applied.` +
        (warnings.length ? ` Warnings: ${warnings.join(" ")}` : "");

      return NextResponse.json({ success: true, message, warnings });

    } catch (installError: any) {
      // 5. Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);

      return NextResponse.json({
        error: `Modpack import failed. Safe Rollback completed. Cause: ${installError.message}`,
        ...(installError instanceof SandboxBootError ? { bootOutput: installError.output } : {}),
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/import-modpack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
