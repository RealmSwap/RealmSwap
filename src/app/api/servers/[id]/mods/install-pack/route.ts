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
  fetchVersions, pickCompatibleVersion, primaryFile,
} from "@/lib/mods/modrinth";
import {
  planModpackFromZip, applyModpackPlan, packResultMessage, auditPackInstall, recordInstalledModpack,
  detectPackServerMcVersion, retireReplacedPackMods, PackPreflightError,
} from "@/lib/mods/packInstall";
import { beginProgress, emitProgress, endProgress, createBootLogEmitter } from "@/lib/mods/progress";
import { testServerBootWithQuarantine } from "@/lib/mods/bootRetry";
import fs from "fs";
import path from "path";
import { requireLocalServer } from "@/lib/agents/perimeter";

// POST /api/servers/[id]/mods/install-pack
// Body: { provider: "curseforge" | "modrinth", projectId: string, fileId?: number, versionId?: string }
//
// One-click install of a modpack from the in-app pack gallery: the pack file
// is resolved (pinned file/version or the newest downloadable one) and
// downloaded server-side, then it rides the exact plan → apply pipeline as
// manual imports — planModpackFromZip dispatches CurseForge manifests and
// .mrpack archives onto the same verified path. Resolution + download +
// pre-flight all happen BEFORE the snapshot, so network/distribution
// failures cost nothing.
const CURSEFORGE_PROJECT_ID = /^\d+$/;
const MODRINTH_PROJECT_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;

    const packInstallSchema = z.object({
      provider: z.enum(["curseforge", "modrinth"]).default("curseforge"),
      projectId: z.string().min(1, "A modpack id is required"),
      fileId: z.number().int().positive().optional(),
      versionId: z.string().min(1).optional(),
      installId: z.string().regex(/^[\w-]{6,64}$/).optional(),
    });
    const parsed = packInstallSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid modpack install parameters", details: parsed.error.format() },
        { status: 400 }
      );
    }
    const provider = parsed.data.provider;
    const projectId = parsed.data.projectId;
    if (provider === "curseforge" && !CURSEFORGE_PROJECT_ID.test(projectId)) {
      return NextResponse.json({ error: "A numeric CurseForge modpack id is required" }, { status: 400 });
    }
    if (provider === "modrinth" && !MODRINTH_PROJECT_ID.test(projectId)) {
      return NextResponse.json({ error: "A Modrinth project id (UUID) is required" }, { status: 400 });
    }

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

    // Resolve the pack file: a pinned file/version wins, else the newest
    // downloadable one of the project. 400-class failures here cost
    // nothing — no snapshot exists yet.
    let packFileId: number | null = null;
    let packFileName: string | null = null;
    let packDownloadUrl: string;
    let serverMcVersion: string;
    let loaderType: string | null;
    const tempPack = path.join(serverRoot, ".pack-download.zip");
    try {
      if (provider === "modrinth") {
        const versions = await fetchVersions(projectId);
        const version = parsed.data.versionId
          ? versions.find((v) => v.version_number === parsed.data.versionId) ?? null
          : pickCompatibleVersion(versions, {});
        const file = version ? primaryFile(version) : null;
        if (!version || !file) {
          return NextResponse.json(
            { error: "This Modrinth modpack has no downloadable versions." },
            { status: 404 }
          );
        }
        if (!file.filename.endsWith(".mrpack") || !file.url) {
          return NextResponse.json(
            { error: "This Modrinth project's newest file is not an installable .mrpack pack." },
            { status: 400 }
          );
        }
        packFileName = file.filename;
        packDownloadUrl = file.url;
      } else {
        let packFile: CurseForgeFile;
        if (parsed.data.fileId) {
          const files = await getCurseForgeFiles([parsed.data.fileId]);
          const match = files.find((f) => f.modId === Number(projectId));
          if (!match) {
            return NextResponse.json(
              { error: `CurseForge file ${parsed.data.fileId} does not belong to modpack ${projectId}.` },
              { status: 400 }
            );
          }
          packFile = match;
        } else {
          const files = await getCurseForgeModFiles(Number(projectId));
          const picked = pickCompatibleCfFile(files, {});
          if (!picked) {
            return NextResponse.json(
              { error: "This modpack has no downloadable files (the author may have disabled third-party distribution)." },
              { status: 404 }
            );
          }
          packFile = picked;
        }
        packFileId = packFile.id;
        packFileName = packFile.fileName;
        packDownloadUrl = curseForgeDownloadUrl(packFile);
      }

      serverMcVersion = detectPackServerMcVersion(serverId);
      loaderType = readLoaderMarker(serverRoot)?.type ?? null;

      await downloadFile(packDownloadUrl, tempPack);
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
      const bootLog = createBootLogEmitter(installId);
      const quarantined = await testServerBootWithQuarantine({
        serverId, serverRoot, game: "MINECRAFT", warnings,
        onProgress: (lbl) => { console.log(`[Sandbox] ${lbl}`); if (installId) emitProgress(installId, { label: lbl }); },
        onBootLine: bootLog,
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
        projectId,
        fileId: packFileId,
        fileName: packFileName,
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
