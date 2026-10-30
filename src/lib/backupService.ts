import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "./db";
import { dataRoot } from "./appPaths";
import { getSavePath as resolveSavePath } from "./backupPaths";
import { verifyBackupFile } from "./backupVerify";
import { startOffsiteUpload } from "./offsiteBackup";
import { safeJoin } from "./safePath";
import { swapDirIntoPlace, withServerLock } from "./atomicFs";
import { reconcileInstalledMods } from "./mods/reconcile";
import { rconManager } from "./rconManager";
import { beginSaveFlush, getSaveFlushPlan, pickBackupsToPrune, SaveFlushSession } from "./saveFlush";
import { enqueueCommand, awaitCommandResult, resolveUsableNode } from "./agents/commands";
import { recordUpload, takeUpload, issueDownloadToken, revokeDownloadToken } from "./agents/agentUploads";
import type { Server } from "@/generated/client";
import { requireLocalServer } from "@/lib/agents/perimeter";

// Get the local save path for each game type. Delegates to the pure resolver,
// injecting the live filesystem roots. DOCKER-runner Valheim servers save under
// the server dir (the container spec redirects HOME to /data/valheim-data),
// not the Windows user profile.
function getSavePath(game: string, serverId: string, runnerType?: string): { srcDir: string; zipPattern: string; destExtractDir: string } {
  return resolveSavePath(game, serverId, {
    dataRoot: dataRoot(),
    userProfile: process.env.USERPROFILE || "",
    dockerValheimWorlds:
      runnerType === "DOCKER"
        ? path.join(dataRoot(), "local-servers", serverId, "valheim-data", ".config", "IronGate", "Valheim", "worlds_local")
        : undefined,
  });
}

// Create a snapshot backup of a local server
export async function createBackup(serverId: string, backupType: "MANUAL" | "AUTOMATED", customName?: string): Promise<any> {
  const server = await prisma.server.findUnique({
    where: { id: serverId }
  });

  if (!server) {
    throw new Error("Server not found");
  }

  if (server.runnerType === "AGENT") {
    return createAgentBackup(server, backupType, customName);
  }
  const { srcDir, zipPattern } = getSavePath(server.game, serverId, server.runnerType);

  // Validate that source directory actually exists and has files before zipping
  if (!fs.existsSync(srcDir)) {
    throw new Error(`No save files found for server. Start the server first to generate the world before taking a snapshot.`);
  }

  // Double check if there are files (specifically for Valheim, check Dedicated.db/fwl)
  if (server.game.toUpperCase() === "VALHEIM") {
    const dbFile = path.join(srcDir, "Dedicated.db");
    const fwlFile = path.join(srcDir, "Dedicated.fwl");
    if (!fs.existsSync(dbFile) && !fs.existsSync(fwlFile)) {
      throw new Error("No Valheim world save files (Dedicated.db/Dedicated.fwl) found. Run the server first.");
    }
  } else {
    const files = fs.readdirSync(srcDir);
    if (files.length === 0) {
      throw new Error("Save directory is empty. Run the server first.");
    }
  }

  return withServerLock(serverId, async () => {
    // A RUNNING server keeps writing its world while we zip. Games with a save
    // command over RCON get quiesced first (see saveFlush.ts); without it the
    // archive can verify fine yet hold a torn world.
    const flushPlan =
      server.status === "RUNNING" || server.status === "STARTING"
        ? getSaveFlushPlan(server.game)
        : null;
    let flush: SaveFlushSession | null = null;
    let flushNote = "";
    try {
      if (flushPlan) {
        flush = await beginSaveFlush(flushPlan, (cmd) => rconManager.execute(serverId, cmd));
        flushNote = flush.flushed
          ? " World saves flushed via RCON before archiving."
          : ` (RCON save flush failed: ${flush.error} — archive may race live writes.)`;
      }

      return await assembleAndRecordBackup(server, srcDir, { backupType, customName, flushNote });
    } catch (err: any) {
      import("./notifications").then(({ sendNotification }) => {
        sendNotification(server.userId, "❌ Backup Failed", `Failed to generate snapshot for '${server.name}': ${err.message}`);
      }).catch(e => console.error("Failed to load notifications module:", e));
      throw err instanceof Error && err.message.startsWith("Failed to generate snapshot")
        ? err
        : new Error(`Failed to generate snapshot: ${err.message}`);
    } finally {
      // Resume the server's world writes no matter how the zip went —
      // Minecraft's autosave must never be left turned off.
      await flush?.resume();
    }
  });
}

/**
 * Zip the save dir + record the Backup row + verify + retain + offsite —
 * everything AFTER the source has been validated and (if running) flushed.
 * Shared by the local flow and the agent flow (which stages the world into a
 * temp dir first), so semantics like verification and retention can't drift.
 */
async function assembleAndRecordBackup(
  server: Server,
  srcDir: string,
  opts: { backupType: "MANUAL" | "AUTOMATED"; customName?: string; flushNote?: string }
): Promise<any> {
  const serverId = server.id;
  const backupType = opts.backupType;
  const flushNote = opts.flushNote ?? "";

  const backupDir = path.join(dataRoot(), "local-backups", serverId);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const dateStr = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const backupName = opts.customName || (backupType === "MANUAL" ? `Manual Snapshot - ${dateStr}` : `Auto Snapshot - ${dateStr}`);

  const backup = await prisma.backup.create({
    data: {
      serverId,
      userId: server.userId,
      name: backupName,
      game: server.game,
      filePath: "",
      fileSizeMB: 0,
      backupType
    }
  });

  const zipPath = path.join(backupDir, `${backup.id}.zip`);
  const tmpZipPath = `${zipPath}.tmp`;

  try {
    const zip = new AdmZip();
    if (server.game.toUpperCase() === "VALHEIM") {
      const dbFile = path.join(srcDir, "Dedicated.db");
      const fwlFile = path.join(srcDir, "Dedicated.fwl");
      if (fs.existsSync(dbFile)) zip.addLocalFile(dbFile);
      if (fs.existsSync(fwlFile)) zip.addLocalFile(fwlFile);
    } else {
      zip.addLocalFolder(srcDir);
    }

    zip.writeZip(tmpZipPath);

    if (!fs.existsSync(tmpZipPath)) {
      throw new Error("Failed to create zip archive.");
    }
    fs.renameSync(tmpZipPath, zipPath);
    const stats = fs.statSync(zipPath);
    const fileSizeMB = parseFloat((stats.size / (1024 * 1024)).toFixed(2));

    const finalBackup = await prisma.backup.update({
      where: { id: backup.id },
      data: {
        filePath: zipPath,
        fileSizeMB
      }
    });

    try {
      const verification = verifyBackupFile(zipPath, server.game);
      await prisma.backup.update({
        where: { id: backup.id },
        data: verification.ok
          ? { verifiedAt: new Date(), verifyError: null }
          : { verifiedAt: null, verifyError: verification.error ?? "Unknown verification error" },
      });
    } catch (verifyErr: any) {
      console.error(`Backup verification error for ${backup.id}:`, verifyErr?.message);
    }

    await prisma.server.update({
      where: { id: serverId },
      data: { lastSnapshotAt: new Date() }
    });

    await prisma.activityLog.create({
      data: {
        userId: server.userId,
        serverId,
        action: "CREATE_BACKUP",
        details: `Created ${backupType.toLowerCase()} backup '${backupName}' for server '${server.name}' (${fileSizeMB} MB).${flushNote}`
      }
    });

    try {
      await pruneBackups(serverId);
    } catch (pruneErr: any) {
      console.error(`Backup retention prune failed for ${serverId}:`, pruneErr?.message);
    }

    startOffsiteUpload(finalBackup.id, serverId, server.userId, zipPath, server.name);

    return finalBackup;
  } catch (err: any) {
    for (const p of [tmpZipPath, zipPath]) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
    }
    await prisma.backup.delete({ where: { id: backup.id } }).catch(() => {});
    import("./notifications").then(({ sendNotification }) => {
      sendNotification(server.userId, "❌ Backup Failed", `Failed to generate snapshot for '${server.name}': ${err.message}`);
    }).catch(e => console.error("Failed to load notifications module:", e));
    throw new Error(`Failed to generate snapshot: ${err.message}`);
  }
}

/**
 * Arguments for the system tar on Windows: --force-local stops GNU tar
 * (Git Bash) reading "C:..." as host:path, and forward slashes stop it
 * mangling backslashes in filenames. Windows' bsdtar accepts both forms.
 */
function systemTarArgs(op: "-xf" | "-cf", tarPath: string, changeTo: string | null, rest: string[] = []): string[] {
  if (process.platform !== "win32") {
    return [op, tarPath, ...(changeTo ? ["-C", changeTo] : []), ...rest];
  }
  const fwd = (p: string) => p.split("\\").join("/");
  return ["--force-local", op, fwd(tarPath), ...(changeTo ? ["-C", fwd(changeTo)] : []), ...rest];
}

/** Extract a tar archive into destDir with the system tar (agent transfers). */
async function extractTar(tarPath: string, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  const { execFile } = await import("child_process");
  await new Promise<void>((resolve, reject) => {
    execFile("tar", systemTarArgs("-xf", tarPath, destDir), (err) => {
      if (err) reject(new Error(`tar extract failed: ${err.message}`));
      else resolve();
    });
  });
}

/** Create a tar of dirOrFiles with the system tar (agent transfers). */
async function createTar(baseDir: string, entries: string[], tarPath: string): Promise<void> {
  const { execFile } = await import("child_process");
  await new Promise<void>((resolve, reject) => {
    execFile("tar", systemTarArgs("-cf", tarPath, baseDir, entries), (err) => {
      if (err) reject(new Error(`tar create failed: ${err.message}`));
      else resolve();
    });
  });
}

/**
 * Backup for AGENT-runner servers: the world lives on the node. The
 * dashboard flushes saves over RCON (the node's LAN IP), commands the agent
 * to tar the save dir and upload it, then runs the SAME recording machinery
 * as local backups (verify, retention, offsite) against the staged tree.
 */
async function createAgentBackup(server: Server, backupType: "MANUAL" | "AUTOMATED", customName?: string): Promise<any> {
  const serverId = server.id;
  const node = await resolveUsableNode(serverId);

  return withServerLock(serverId, async () => {
    // Quiesce live writes exactly like the local flow — RCON reaches the
    // node via resolveGameHost.
    const flushPlan =
      server.status === "RUNNING" || server.status === "STARTING"
        ? getSaveFlushPlan(server.game)
        : null;
    let flush: SaveFlushSession | null = null;
    let flushNote = "";
    try {
      if (flushPlan) {
        flush = await beginSaveFlush(flushPlan, (cmd) => rconManager.execute(serverId, cmd));
        flushNote = flush.flushed
          ? " World saves flushed via RCON before archiving."
          : ` (RCON save flush failed: ${flush.error} — archive may race live writes.)`;
      }

      // The agent-side layout matches the DOCKER layout (HOME redirects etc.),
      // so save paths resolve through the DOCKER branch and go to the agent
      // relative to the server's data dir.
      const { srcDir } = getSavePath(server.game, serverId, "DOCKER");
      const serverDataDir = path.join(dataRoot(), "local-servers", serverId);
      const srcRelDir = path.relative(serverDataDir, srcDir).split(path.sep).join("/");
      const isValheim = server.game.toUpperCase() === "VALHEIM";

      const outcome = await enqueueAndAwait(
        node.id, serverId, "BACKUP_CREATE",
        {
          kind: "BACKUP_CREATE",
          dataDirName: serverId,
          srcRelDir,
          ...(isValheim ? { includeFiles: ["Dedicated.db", "Dedicated.fwl"] } : {}),
          uploadPath: `/api/agents/upload?serverId=${serverId}`,
        },
        20 * 60 * 1000,
      );
      if (!outcome.ok) {
        throw new Error(outcome.error ?? "Agent did not complete the backup in time");
      }
      let uploadId = "";
      try { uploadId = JSON.parse(outcome.output ?? "{}").uploadId ?? ""; } catch { /* handled below */ }
      if (!uploadId) {
        throw new Error("Agent completed the backup without delivering the archive.");
      }
      const upload = takeUpload(uploadId, node.id, serverId);
      if (!upload || !fs.existsSync(upload.filePath)) {
        throw new Error("The uploaded archive could not be found (expired or wrong server).");
      }

      // Stage the tar's contents, then treat the staged tree exactly like a
      // local save dir.
      const stageDir = `${upload.filePath}.staged`;
      fs.rmSync(stageDir, { recursive: true, force: true });
      try {
        await extractTar(upload.filePath, stageDir);
        // Zip shape must match the local flow (save-dir contents at the zip
        // root): Valheim's tar is rooted at the worlds dir, so its two files
        // land at the stage root; every other game's tar keeps srcRelDir.
        const srcForZip = isValheim ? stageDir : path.join(stageDir, srcRelDir);
        if (!fs.existsSync(srcForZip)) {
          throw new Error("The uploaded archive did not contain the expected save directory.");
        }
        return await assembleAndRecordBackup(server, srcForZip, { backupType, customName, flushNote });
      } finally {
        fs.rmSync(stageDir, { recursive: true, force: true });
        try { if (fs.existsSync(upload.filePath)) fs.unlinkSync(upload.filePath); } catch (_) {}
      }
    } finally {
      await flush?.resume();
    }
  });
}

/** Shared tail of the agent command flow: node checks + enqueue + await. */
async function enqueueAndAwait(
  nodeId: string,
  serverId: string,
  type: "BACKUP_CREATE" | "BACKUP_RESTORE",
  payload: any,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string; output?: string }> {
  const { id } = await enqueueCommand(nodeId, serverId, type, payload);
  return awaitCommandResult(id, timeoutMs);
}

/**
 * Restore for AGENT-runner servers: verify the zip here (never trust a
 * restore), re-tar it, hand the agent a one-shot download token, and let it
 * stage-and-swap (or overlay for Valheim) on the node.
 */
async function restoreAgentBackup(backup: any, localPath: string): Promise<void> {
  const server = backup.server;
  const node = await resolveUsableNode(server.id);

  await withServerLock(backup.serverId, async () => {
    // The zip was verified by the caller before this point.
    const zipStage = `${localPath}.agent-restore`;
    const tarPath = `${localPath}.agent-restore.tar`;
    fs.rmSync(zipStage, { recursive: true, force: true });
    let token: string | null = null;
    try {
      const zip = new AdmZip(localPath);
      zip.extractAllTo(zipStage, true);
      const isValheim = backup.game.toUpperCase() === "VALHEIM";
      let tarBase = zipStage;
      let entries: string[] = [];
      if (isValheim) {
        entries = ["Dedicated.db", "Dedicated.fwl"].filter((f) => fs.existsSync(path.join(zipStage, f)));
        if (entries.length === 0) {
          throw new Error("Backup archive contains no Valheim world files.");
        }
      } else {
        entries = fs.readdirSync(zipStage);
      }
      await createTar(tarBase, entries, tarPath);

      const { destExtractDir } = getSavePath(backup.game, backup.serverId, "DOCKER");
      const serverDataDir = path.join(dataRoot(), "local-servers", backup.serverId);
      const destRelDir = path.relative(serverDataDir, destExtractDir).split(path.sep).join("/");

      token = issueDownloadToken(tarPath, node.id, backup.serverId);
      const outcome = await enqueueAndAwait(
        node.id, backup.serverId, "BACKUP_RESTORE",
        {
          kind: "BACKUP_RESTORE",
          dataDirName: backup.serverId,
          destRelDir,
          mode: isValheim ? "overlay" : "swap",
          downloadPath: `/api/agents/download/${token}?serverId=${backup.serverId}`,
        },
        20 * 60 * 1000,
      );
      if (!outcome.ok) {
        throw new Error(outcome.error ?? "Agent did not complete the restore in time");
      }
    } finally {
      if (token) revokeDownloadToken(token);
      fs.rmSync(zipStage, { recursive: true, force: true });
      try { if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath); } catch (_) {}
    }
  });

  await prisma.activityLog.create({
    data: {
      userId: backup.userId,
      serverId: backup.serverId,
      action: "RESTORE_SERVER",
      details: `Restored ${backup.name} to server '${server.name}' on node '${node.name}'.`
    }
  });

  try {
    await reconcileInstalledMods(backup.serverId);
  } catch (err) {
    console.error("Post-restore mod reconciliation failed:", err);
  }
}

/**
 * Enforce the server's keep-last-N snapshot retention, deleting each excess
 * backup's file and row together. The newest verified backup always survives
 * (see pickBackupsToPrune) — retention may never remove the only restore point
 * proven restorable. Returns how many backups were removed.
 */
export async function pruneBackups(serverId: string): Promise<number> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { backupRetention: true, userId: true, name: true },
  });
  if (!server) return 0;

  const backups = await prisma.backup.findMany({
    where: { serverId },
    orderBy: { createdAt: "desc" },
    select: { id: true, verifiedAt: true },
  });

  const doomed = pickBackupsToPrune(backups, server.backupRetention);
  let deleted = 0;
  for (const b of doomed) {
    try {
      await deleteBackup(b.id);
      deleted++;
    } catch (err: any) {
      // One undeletable file (locked by AV, etc.) must not strand the rest.
      console.error(`Retention could not delete backup ${b.id}:`, err?.message);
    }
  }

  if (deleted > 0) {
    await prisma.activityLog.create({
      data: {
        userId: server.userId,
        serverId,
        action: "DELETE_BACKUP",
        details: `Backup retention for server '${server.name}' removed ${deleted} old snapshot(s) (keep last ${server.backupRetention}).`,
      },
    }).catch(() => {});
  }
  return deleted;
}

/**
 * Overlay the staged Valheim save files onto the live worlds folder.
 * Valheim backups hold only the Dedicated.* files at the archive root while
 * the destination folder may contain other local worlds, so the folder is
 * never replaced wholesale — each staged file swaps in with the previous
 * copy kept aside until every file has landed.
 */
function overlayValheimFiles(stagingDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  const saved: { tmp: string; dest: string }[] = [];
  try {
    for (const name of fs.readdirSync(stagingDir)) {
      const staged = path.join(stagingDir, name);
      if (fs.statSync(staged).isDirectory()) continue; // dedicated saves are flat files
      const dest = safeJoin(destDir, name);
      if (fs.existsSync(dest)) {
        const tmp = `${dest}.pre-restore`;
        fs.rmSync(tmp, { force: true });
        fs.renameSync(dest, tmp);
        saved.push({ tmp, dest });
      }
      fs.copyFileSync(staged, dest);
    }
  } catch (err) {
    // Put back every file that was moved aside before the failure.
    for (const s of saved) {
      try {
        if (!fs.existsSync(s.dest)) fs.renameSync(s.tmp, s.dest);
      } catch (_) {}
    }
    throw err;
  }
  for (const s of saved) {
    try { fs.rmSync(s.tmp, { force: true }); } catch (_) {}
  }
}

// Restore a local server backup snapshot. `sourcePath` overrides the row's
// local file — used when restoring from the offsite copy after the local file
// is gone (the whole point of offsite backups).
export async function restoreBackup(backupId: string, sourcePath?: string): Promise<void> {
  const backup = await prisma.backup.findUnique({
    where: { id: backupId },
    include: { server: true }
  });

  if (!backup) {
    throw new Error("Backup snapshot not found.");
  }

  // Ensure server is not currently running
  if (backup.server.status === "RUNNING" || backup.server.status === "STARTING") {
    throw new Error("Please stop the server before restoring a snapshot to avoid save data corruption.");
  }

  const localPath = sourcePath ?? backup.filePath;

  if (!fs.existsSync(localPath)) {
    throw new Error(`Backup zip file was not found on disk at: ${backup.filePath}${backup.offsiteStatus === "UPLOADED" ? " — an offsite copy exists and can be restored instead." : ""}`);
  }

  // A restore that dies mid-extract must never take the live world with it,
  // so the archive is proven restorable BEFORE the live directory is touched.
  const verification = verifyBackupFile(localPath, backup.game);
  if (!verification.ok) {
    throw new Error(
      `Backup archive failed verification (${verification.error ?? "unknown error"}). Restore refused — the current world was not modified. Re-verify or delete this backup.`
    );
  }

  if (backup.server.runnerType === "AGENT") {
    await restoreAgentBackup(backup, localPath);
    return;
  }
  const { destExtractDir } = getSavePath(backup.game, backup.serverId, backup.server.runnerType);

  await withServerLock(backup.serverId, async () => {
    const stagingDir = `${destExtractDir}.restore-staging`;
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });
    try {
      // Extract into staging first: a corrupt archive or full disk fails
      // here with the live world still intact.
      const zip = new AdmZip(localPath);
      zip.extractAllTo(stagingDir, true);

      if (backup.game.toUpperCase() === "VALHEIM") {
        overlayValheimFiles(stagingDir, destExtractDir);
      } else {
        swapDirIntoPlace(stagingDir, destExtractDir);
      }
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  });

  // Write Activity Log
  await prisma.activityLog.create({
    data: {
      userId: backup.userId,
      serverId: backup.serverId,
      action: "RESTORE_SERVER",
      details: `Restored ${sourcePath ? "the offsite copy of " : ""}backup '${backup.name}' to server '${backup.server.name}'.`
    }
  });

  // Backups today only restore save data, but keep the invariant "after any
  // restore, mod rows match disk" structural rather than call-site-dependent.
  // Best-effort: the restore itself already succeeded.
  try {
    await reconcileInstalledMods(backup.serverId);
  } catch (err) {
    console.error("Post-restore mod reconciliation failed:", err);
  }
}

// Delete a local server backup snapshot
export async function deleteBackup(backupId: string): Promise<void> {
  const backup = await prisma.backup.findUnique({
    where: { id: backupId }
  });

  if (!backup) {
    throw new Error("Backup snapshot not found.");
  }

  // Remove zip file if exists on disk
  if (fs.existsSync(backup.filePath)) {
    try {
      fs.unlinkSync(backup.filePath);
    } catch (e: any) {
      console.error(`Failed to delete zip file from disk: ${e.message}`);
    }
  }

  // Delete from DB
  await prisma.backup.delete({
    where: { id: backupId }
  });
}
