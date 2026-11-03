import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { dataRoot } from "@/lib/appPaths";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { SandboxBootError } from "@/lib/runners/sandbox";
import { downloadFile } from "@/lib/download";
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

export { PackPreflightError };

/**
 * Resolution/pre-flight failure (bad ids, no downloadable file, distribution
 * disabled, manifest invalid, MC version unreadable). Happens BEFORE the
 * snapshot, so routes map it to a cheap 400 and nothing rolls back.
 */
export class PackResolveError extends Error {}

export interface InstallModpackArgs {
  serverId: string;
  serverName: string;
  userId: string;
  provider: "curseforge" | "modrinth";
  projectId: string;
  fileId?: number;
  versionId?: string;
  installId?: string;
}

export interface InstallModpackResult {
  message: string;
  warnings: string[];
}

export function isPackResolveError(err: unknown): err is PackResolveError {
  return err instanceof PackResolveError || err instanceof PackPreflightError;
}

/**
 * One-click install of a provider modpack onto an EXISTING (stopped) local
 * server: resolve (pinned file/version or newest downloadable), download,
 * pre-flight, then the exact snapshot → apply → sandbox boot test →
 * auto-rollback pipeline manual imports use. Extracted from the install-pack
 * route so realm materialization rides the identical path.
 */
export async function installModpackOnServer(args: InstallModpackArgs): Promise<InstallModpackResult> {
  const { serverId, userId, provider, projectId } = args;
  const serverRoot = path.join(dataRoot(), "local-servers", serverId);
  const warnings: string[] = [];
  const installId = args.installId;
  if (installId) beginProgress(installId);

  try {
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
        // A pinned "versionId" may be the version's actual id (ULID) or its
        // version_number — both identify the version callers hold from search.
        const version = args.versionId
          ? versions.find((v) => v.version_number === args.versionId || v.id === args.versionId) ?? null
          : pickCompatibleVersion(versions, {});
        const file = version ? primaryFile(version) : null;
        if (!version || !file) {
          throw new PackResolveError("This Modrinth modpack has no downloadable versions.");
        }
        if (!file.filename.endsWith(".mrpack") || !file.url) {
          throw new PackResolveError("This Modrinth project's newest file is not an installable .mrpack pack.");
        }
        packFileName = file.filename;
        packDownloadUrl = file.url;
      } else {
        let packFile: CurseForgeFile;
        if (args.fileId) {
          const files = await getCurseForgeFiles([args.fileId]);
          const match = files.find((f) => f.modId === Number(projectId));
          if (!match) {
            throw new PackResolveError(`CurseForge file ${args.fileId} does not belong to modpack ${projectId}.`);
          }
          packFile = match;
        } else {
          const files = await getCurseForgeModFiles(Number(projectId));
          const picked = pickCompatibleCfFile(files, {});
          if (!picked) {
            throw new PackResolveError("This modpack has no downloadable files (the author may have disabled third-party distribution).");
          }
          packFile = picked;
        }
        packFileId = packFile.id;
        packFileName = packFile.fileName;
        packDownloadUrl = curseForgeDownloadUrl(packFile);
      }

      serverMcVersion = detectPackServerMcVersion(serverId);
      loaderType = readLoaderMarker(serverRoot)?.type ?? null;

      if (installId) emitProgress(installId, { stage: "resolving", label: "Downloading the modpack" });
      await downloadFile(packDownloadUrl, tempPack);
    } catch (resolveError: any) {
      try { fs.unlinkSync(tempPack); } catch (_) {}
      if (resolveError instanceof PackResolveError) throw resolveError;
      throw new PackResolveError(resolveError.message || "Could not download the modpack.");
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
      if (preflightError instanceof PackPreflightError) throw preflightError;
      throw preflightError;
    } finally {
      try { fs.unlinkSync(tempPack); } catch (_) {}
    }

    if (installId) emitProgress(installId, { stage: "snapshot", label: "Taking a safety snapshot" });
    const snapshot = await createSnapshot(serverId, userId, `Pre-modpack: ${plan.packName}`);

    try {
      const result = await applyModpackPlan({
        plan, serverId, serverRoot, serverMcVersion, warnings,
        progress: (event) => { if (installId) emitProgress(installId, event); },
      });

      await retireReplacedPackMods({ serverId, serverRoot, plan, result, warnings });
      if (installId) emitProgress(installId, { stage: "boot", label: "Booting the server once to verify the install", current: 0, total: 1 });
      const bootLog = createBootLogEmitter(installId);
      const quarantined = await testServerBootWithQuarantine({
        serverId, serverRoot, game: "MINECRAFT", warnings,
        onProgress: (lbl) => { if (installId) emitProgress(installId, { label: lbl }); },
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

      await auditPackInstall({ userId, serverName: args.serverName, plan, result, warnings });
      await recordInstalledModpack({
        serverId, plan, result,
        projectId,
        fileId: packFileId,
        fileName: packFileName,
      });

      if (installId) endProgress(installId, "done");
      return { message: packResultMessage({ plan, result, warnings }), warnings };
    } catch (installError: any) {
      // Automatic Rollback
      installError.warnings = warnings;
      if (installId) emitProgress(installId, { label: "Install failed — rolling back safely" });
      if (installId) endProgress(installId, "error", installError.message || "Pack install failed");
      try {
        await restoreSnapshot(snapshot.id);
        await discardSnapshot(snapshot.id);
      } catch (rollbackErr: any) {
        console.error(`[PackInstall] rollback failed for ${serverId}:`, rollbackErr);
      }
      throw installError;
    }
  } catch (error: any) {
    // Snapshot failures land here without a terminal frame — end the
    // session so the UI doesn't freeze on the current stage forever.
    // (Inner install failures already ended it; a second terminal frame
    // is a benign overwrite during the session's grace window.)
    if (installId) endProgress(installId, "error", error.message || "Pack install failed");
    throw error;
  }
}

/** SandboxBootError passthrough for routes that expose boot output. */
export function bootOutputOf(err: unknown): string | undefined {
  return err instanceof SandboxBootError ? err.output : undefined;
}
