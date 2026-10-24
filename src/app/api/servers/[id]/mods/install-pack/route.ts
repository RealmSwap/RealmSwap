import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { downloadFile } from "@/lib/download";
import { readLoaderMarker } from "@/lib/mods/mcLoaders";
import {
  getCurseForgeModFiles, getCurseForgeFiles, curseForgeDownloadUrl,
  pickCompatibleCfFile, type CurseForgeFile,
} from "@/lib/mods/curseforge";
import {
  planModpackFromZip, applyModpackPlan, packResultMessage, auditPackInstall, recordInstalledModpack,
  detectPackServerMcVersion, PackPreflightError,
} from "@/lib/mods/packInstall";
import fs from "fs";
import path from "path";

// POST /api/servers/[id]/mods/install-pack
// Body: { projectId: string, fileId?: number }
//
// One-click install of a CurseForge modpack from the in-app pack browser:
// the pack zip is resolved (pinned fileId or the newest downloadable file)
// and downloaded server-side, then it rides the exact plan → apply pipeline
// as manual imports. Resolution + download + pre-flight all happen BEFORE
// the snapshot, so network/distribution failures cost nothing.
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

    const packInstallSchema = z.object({
      projectId: z.string().regex(/^\d+$/, "A numeric CurseForge modpack id is required"),
      fileId: z.number().int().positive().optional(),
    });
    const parsed = packInstallSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid modpack install parameters", details: parsed.error.format() },
        { status: 400 }
      );
    }
    const projectId = Number(parsed.data.projectId);

    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before installing a modpack." }, { status: 400 });
    }

    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Modpack installs are only supported for Minecraft servers." }, { status: 400 });
    }

    const serverRoot = path.join(dataRoot(), "local-servers", serverId);
    const warnings: string[] = [];

    // Resolve the pack file: a pinned fileId wins, else the newest
    // downloadable file of the project. 400-class failures here cost
    // nothing — no snapshot exists yet.
    let packFile: CurseForgeFile;
    let serverMcVersion: string;
    let loaderType: string | null;
    const tempPack = path.join(serverRoot, ".pack-download.zip");
    try {
      if (parsed.data.fileId) {
        const files = await getCurseForgeFiles([parsed.data.fileId]);
        const match = files.find((f) => f.modId === projectId);
        if (!match) {
          return NextResponse.json(
            { error: `CurseForge file ${parsed.data.fileId} does not belong to modpack ${projectId}.` },
            { status: 400 }
          );
        }
        packFile = match;
      } else {
        const files = await getCurseForgeModFiles(projectId);
        const picked = pickCompatibleCfFile(files, {});
        if (!picked) {
          return NextResponse.json(
            { error: "This modpack has no downloadable files (the author may have disabled third-party distribution)." },
            { status: 404 }
          );
        }
        packFile = picked;
      }

      serverMcVersion = detectPackServerMcVersion(serverId);
      loaderType = readLoaderMarker(serverRoot)?.type ?? null;

      await downloadFile(curseForgeDownloadUrl(packFile), tempPack);
    } catch (resolveError: any) {
      try { fs.unlinkSync(tempPack); } catch (_) {}
      return NextResponse.json({ error: resolveError.message }, { status: 400 });
    }

    // Parse + pre-flight (manifest validity, CurseForge metadata gates,
    // pack MC version, loader conflicts) before spending a snapshot.
    let plan: Awaited<ReturnType<typeof planModpackFromZip>>;
    try {
      plan = await planModpackFromZip({
        zipBuffer: fs.readFileSync(tempPack),
        serverMcVersion,
        loaderType,
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

    const snapshot = await createSnapshot(serverId, user.id, `Pre-modpack: ${plan.packName}`);

    try {
      const result = await applyModpackPlan({ plan, serverId, serverRoot, serverMcVersion, warnings });

      console.log(`[Sandbox] Running boot test for ${serverId}`);
      await testServerBoot(serverId, "MINECRAFT");
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      await auditPackInstall({ userId: user.id, serverName: server.name, plan, result, warnings });
      await recordInstalledModpack({
        serverId, plan, result,
        projectId: String(projectId),
        fileId: packFile.id,
        fileName: packFile.fileName,
      });

      return NextResponse.json({
        success: true,
        message: packResultMessage({ plan, result, warnings }),
        warnings,
      });

    } catch (installError: any) {
      // Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);

      return NextResponse.json({
        error: `Modpack install failed. Safe Rollback completed. Cause: ${installError.message}`,
        ...(installError instanceof SandboxBootError ? { bootOutput: installError.output } : {}),
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/install-pack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
