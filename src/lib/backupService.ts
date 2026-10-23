import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "./db";
import { dataRoot } from "./appPaths";
import { getSavePath as resolveSavePath } from "./backupPaths";
import { verifyBackupFile } from "./backupVerify";
import { cloudSync } from "./cloudSync";
import { safeJoin } from "./safePath";
import { swapDirIntoPlace, withServerLock } from "./atomicFs";
import { reconcileInstalledMods } from "./mods/reconcile";

// Get the local save path for each game type. Delegates to the pure resolver,
// injecting the live filesystem roots.
function getSavePath(game: string, serverId: string): { srcDir: string; zipPattern: string; destExtractDir: string } {
  return resolveSavePath(game, serverId, {
    dataRoot: dataRoot(),
    userProfile: process.env.USERPROFILE || "",
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

  const { srcDir, zipPattern } = getSavePath(server.game, serverId);

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

  // Create local-backups target directory
  const backupDir = path.join(dataRoot(), "local-backups", serverId);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Create temporary backup record in Prisma to get the ID
  const dateStr = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const backupName = customName || (backupType === "MANUAL" ? `Manual Snapshot - ${dateStr}` : `Auto Snapshot - ${dateStr}`);

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
  // The archive is assembled in memory and written in one synchronous call —
  // a disk-full or crash mid-write must never leave a truncated zip at the
  // final path where a later `existsSync` would treat it as a backup.
  const tmpZipPath = `${zipPath}.tmp`;

  return withServerLock(serverId, async () => {
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

      // Update backup file details
      const finalBackup = await prisma.backup.update({
        where: { id: backup.id },
        data: {
          filePath: zipPath,
          fileSizeMB
        }
      });

      // Verify the archive we just wrote is actually restorable, and record the
      // result on the row (a backup that can't inflate is worse than no backup —
      // it looks safe). Fire-and-report: verification must not fail the snapshot.
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

      // Update server's lastSnapshotAt
      await prisma.server.update({
        where: { id: serverId },
        data: { lastSnapshotAt: new Date() }
      });

      // Write Activity Log
      await prisma.activityLog.create({
        data: {
          userId: server.userId,
          serverId,
          action: "CREATE_BACKUP",
          details: `Created local ${backupType.toLowerCase()} backup '${backupName}' for server '${server.name}' (${fileSizeMB} MB).`
        }
      });

      // Asynchronously upload to S3 if configured
      cloudSync.uploadSnapshot(serverId, zipPath).catch(err => {
        console.error(`Failed to upload snapshot to S3: ${err.message}`);
      });

      return finalBackup;
    } catch (err: any) {
      // Clean up partial archive and DB record so a failed backup leaves
      // nothing behind that could be mistaken for a restorable snapshot.
      for (const p of [tmpZipPath, zipPath]) {
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
      }
      await prisma.backup.delete({ where: { id: backup.id } }).catch(() => {});
      import("./notifications").then(({ sendNotification }) => {
        sendNotification(server.userId, "❌ Backup Failed", `Failed to generate snapshot for '${server.name}': ${err.message}`);
      }).catch(e => console.error("Failed to load notifications module:", e));
      throw new Error(`Failed to generate snapshot: ${err.message}`);
    }
  });
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

// Restore a local server backup snapshot
export async function restoreBackup(backupId: string): Promise<void> {
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

  if (!fs.existsSync(backup.filePath)) {
    throw new Error(`Backup zip file was not found on disk at: ${backup.filePath}`);
  }

  // A restore that dies mid-extract must never take the live world with it,
  // so the archive is proven restorable BEFORE the live directory is touched.
  const verification = verifyBackupFile(backup.filePath, backup.game);
  if (!verification.ok) {
    throw new Error(
      `Backup archive failed verification (${verification.error ?? "unknown error"}). Restore refused — the current world was not modified. Re-verify or delete this backup.`
    );
  }

  const { destExtractDir } = getSavePath(backup.game, backup.serverId);

  await withServerLock(backup.serverId, async () => {
    const stagingDir = `${destExtractDir}.restore-staging`;
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });
    try {
      // Extract into staging first: a corrupt archive or full disk fails
      // here with the live world still intact.
      const zip = new AdmZip(backup.filePath);
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
      details: `Restored local backup '${backup.name}' to server '${backup.server.name}'.`
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
