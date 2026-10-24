import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { safeJoin } from "@/lib/safePath";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { downloadFile } from "@/lib/download";
import { readLoaderMarker } from "@/lib/mods/mcLoaders";
import {
  getCurseForgeModFiles, getCurseForgeFiles, curseForgeDownloadUrl,
  pickCompatibleCfFile, type CurseForgeFile,
} from "@/lib/mods/curseforge";
import {
  planModpackFromZip, applyModpackPlan, recordInstalledModpack, detectPackServerMcVersion,
  PackPreflightError,
} from "@/lib/mods/packInstall";
import fs from "fs";
import path from "path";
import { requireLocalServer } from "@/lib/agents/perimeter";

// GET /api/servers/[id]/mods/pack — the server's installed pack identity.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const pack = await prisma.installedModpack.findUnique({ where: { serverId: params.id } });
    return NextResponse.json({
      pack,
      // Only CurseForge packs installed through install-pack carry a project
      // id — updates resolve a newer pack FILE through it. Imported packs
      // (.mrpack uploads, manifest.json without project identity) have no
      // upstream to ask, so their update path is re-importing a newer file.
      updatable: !!pack?.projectId,
    });
  } catch (error: any) {
    console.error("GET mods/pack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/servers/[id]/mods/update-pack
//
// Re-resolve the installed CurseForge pack's newest downloadable file, then
// ride the same plan → apply → sandbox boot → rollback pipeline as installs.
// Mods the new manifest drops are retired: their jar and ModInstallation row
// are removed (scoped to the OLD pack's recorded packageIds — mods the user
// installed separately are never touched).
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
    requireLocalServer(server, "Modpack updates");

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before updating the modpack." }, { status: 400 });
    }
    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Modpack updates are only supported for Minecraft servers." }, { status: 400 });
    }

    const installed = await prisma.installedModpack.findUnique({ where: { serverId } });
    if (!installed) {
      return NextResponse.json({ error: "No modpack is recorded on this server — install one first." }, { status: 404 });
    }
    if (!installed.projectId) {
      return NextResponse.json(
        { error: "This pack was imported manually and has no CurseForge project identity — re-import a newer pack file instead." },
        { status: 400 }
      );
    }

    const serverRoot = path.join(dataRoot(), "local-servers", serverId);
    const warnings: string[] = [];

    // Resolve the newest pack file BEFORE spending a snapshot.
    let packFile: CurseForgeFile;
    const tempPack = path.join(serverRoot, ".pack-download.zip");
    try {
      const files = await getCurseForgeModFiles(Number(installed.projectId));
      const picked = pickCompatibleCfFile(files, {});
      if (!picked) {
        return NextResponse.json({ error: "The pack has no downloadable files anymore." }, { status: 404 });
      }
      if (installed.fileId != null && picked.id === installed.fileId) {
        return NextResponse.json({
          success: true,
          updated: false,
          message: `'${installed.packName}' is already on the newest pack file (${installed.fileName ?? installed.fileId}).`,
        });
      }
      packFile = picked;
      await downloadFile(curseForgeDownloadUrl(packFile), tempPack);
    } catch (resolveError: any) {
      try { fs.unlinkSync(tempPack); } catch (_) {}
      return NextResponse.json({ error: resolveError.message }, { status: 400 });
    }

    // Pre-flight the NEW pack against the server before the snapshot.
    let plan: Awaited<ReturnType<typeof planModpackFromZip>>;
    let serverMcVersion: string;
    try {
      serverMcVersion = detectPackServerMcVersion(serverId);
      plan = await planModpackFromZip({
        zipBuffer: fs.readFileSync(tempPack),
        serverMcVersion,
        loaderType: readLoaderMarker(serverRoot)?.type ?? null,
      });
    } catch (preflightError: any) {
      try { fs.unlinkSync(tempPack); } catch (_) {}
      if (preflightError instanceof PackPreflightError) {
        return NextResponse.json({ error: preflightError.message }, { status: 400 });
      }
      throw preflightError;
    } finally {
      try { fs.unlinkSync(tempPack); } catch (_) {}
    }

    const oldPackageIds: string[] = (() => {
      try {
        const parsed = JSON.parse(installed.packageIds ?? "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })();

    const snapshot = await createSnapshot(serverId, user.id, `Pre-pack-update: ${plan.packName}`);

    try {
      const result = await applyModpackPlan({ plan, serverId, serverRoot, serverMcVersion, warnings });

      // Retire mods the new manifest dropped — ONLY within the set the old
      // pack version owned (recorded at its install).
      const newIds = new Set(result.installedPackageIds);
      const provider = plan.kind === "curseforge" ? "curseforge" : "modrinth";
      const retired: string[] = [];
      for (const packageId of oldPackageIds) {
        if (newIds.has(packageId)) continue;
        const jarPath = safeJoin(path.join(serverRoot, "mods"), `${packageId}.jar`);
        try {
          fs.unlinkSync(jarPath);
        } catch {}
        await prisma.modInstallation.deleteMany({
          where: { serverId, provider, packageId },
        });
        retired.push(packageId);
      }
      if (retired.length > 0) {
        warnings.push(`${retired.length} mod(s) left the new pack version and were removed.`);
      }

      console.log(`[Sandbox] Running boot test for ${serverId}`);
      await testServerBoot(serverId, "MINECRAFT");
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      await recordInstalledModpack({
        serverId, plan, result,
        projectId: installed.projectId,
        fileId: packFile.id,
        fileName: packFile.fileName,
      });
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "UPDATE_MODPACK",
          details: `Updated modpack '${installed.packName}' (${installed.version}) → '${plan.packName}' (${plan.packVersion}) on server '${server.name}': ${result.installedCount} files installed${retired.length ? `, ${retired.length} retired` : ""}.${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}`,
        },
      });

      return NextResponse.json({
        success: true,
        updated: true,
        message:
          `Updated '${plan.packName}' to ${plan.packVersion}: ${result.installedCount} files installed` +
          `${retired.length ? `, ${retired.length} mod(s) retired` : ""}.` +
          (warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""),
        warnings,
      });
    } catch (installError: any) {
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);

      return NextResponse.json({
        error: `Modpack update failed. Safe Rollback completed. Cause: ${installError.message}`,
        ...(installError instanceof SandboxBootError ? { bootOutput: installError.output } : {}),
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/update-pack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
