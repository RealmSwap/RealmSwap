import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { downloadFile } from "@/lib/download";
import { prisma } from "@/lib/db";
import { readLoaderMarker } from "@/lib/mods/mcLoaders";
import {
  getCurseForgeModFiles, getCurseForgeFiles, curseForgeDownloadUrl,
  pickCompatibleCfFile, type CurseForgeFile,
} from "@/lib/mods/curseforge";
import {
  planModpackFromZip, applyModpackPlan, packResultMessage, auditPackInstall, recordInstalledModpack,
  detectPackServerMcVersion, retireReplacedPackMods, PackPreflightError,
} from "@/lib/mods/packInstall";
import { beginProgress, emitProgress, endProgress } from "@/lib/mods/progress";
import { testServerBootWithQuarantine } from "@/lib/mods/bootRetry";
import fs from "fs";
import path from "path";
import { requireLocalServer } from "@/lib/agents/perimeter";

// POST /api/servers/[id]/mods/install-pack
// Body: { projectId: string, fileId?: number }
//
// One-click install of a CurseForge modpack from the in-app pack browser:
// the pack zip is resolved (pinned fileId or the newest downloadable file)
// and downloaded server-side, then it rides the exact plan → apply pipeline
// as manual imports. Resolution + download + pre-flight all happen BEFORE
// the snapshot, so network/distribution failures cost nothing.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;

    const packInstallSchema = z.object({
      projectId: z.string().regex(/^\d+$/, "A numeric CurseForge modpack id is required"),
      fileId: z.number().int().positive().optional(),
      installId: z.string().regex(/^[\w-]{6,64}$/).optional(),
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
    requireLocalServer(server, "Modpack installs");

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before installing a modpack." }, { status: 400 });
    }

    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Modpack installs are only supported for Minecraft servers." }, { status: 400 });
    }

    const serverRoot = path.join(dataRoot(), "local-servers", serverId);
    const warnings: string[] = [];

    // Progress sessions are keyed by the client's installId. The SSE route
    // auth-checks every subscriber against this server, so a guessed id only
    // exposes the stage feed of a server the caller can already see.
    const installId = parsed.data.installId;
    if (installId) beginProgress(installId);

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

    if (installId) emitProgress(installId, { stage: "snapshot", label: "Taking a safety snapshot" });
    const snapshot = await createSnapshot(serverId, user.id, `Pre-modpack: ${plan.packName}`);

    try {
      const result = await applyModpackPlan({
        plan, serverId, serverRoot, serverMcVersion, warnings,
        progress: (event) => { if (installId) emitProgress(installId, event); },
      });

      console.log(`[Sandbox] Running boot test for ${serverId}`);
      await retireReplacedPackMods({ serverId, serverRoot, plan, result, warnings });
      if (installId) emitProgress(installId, { stage: "boot", label: "Booting the server once to verify the install", current: 0, total: 1 });
      const quarantined = await testServerBootWithQuarantine({
        serverId, serverRoot, game: "MINECRAFT", warnings,
        onProgress: (lbl) => { console.log(`[Sandbox] ${lbl}`); if (installId) emitProgress(installId, { label: lbl }); },
      });
      if (quarantined.length > 0) {
        // Quarantined jars' install rows are keyed by jar basename.
        for (const name of quarantined) {
          const packageId = name.replace(/\.jar$/, "");
          await prisma.modInstallation.deleteMany({ where: { serverId, packageId } });
        }
      }
      if (installId) emitProgress(installId, { current: 1 });
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      await auditPackInstall({ userId: user.id, serverName: server.name, plan, result, warnings });
      await recordInstalledModpack({
        serverId, plan, result,
        projectId: String(projectId),
        fileId: packFile.id,
        fileName: packFile.fileName,
      });

      if (installId) endProgress(installId, "done");
      return NextResponse.json({
        success: true,
        message: packResultMessage({ plan, result, warnings }),
        warnings,
      });

    } catch (installError: any) {
      // Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      if (installId) emitProgress(installId, { label: "Install failed — rolling back safely" });
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);
      if (installId) endProgress(installId, "error", installError.message);

      return NextResponse.json({
        error: `Modpack install failed. Safe Rollback completed. Cause: ${installError.message}`,
        ...(installError instanceof SandboxBootError ? { bootOutput: installError.output } : {}),
        ...(warnings.length ? { warnings } : {}),
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/install-pack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
