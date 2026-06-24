import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { prisma } from "./db";
import { dataRoot } from "./appPaths";
import { getSavePath as resolveSavePath } from "./backupPaths";

// Helper to execute PowerShell commands
function runPowerShell(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`powershell -Command "${cmd}"`, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

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
  const cleanZipPath = zipPath.replace(/\\/g, "/");
  const cleanZipPattern = zipPattern.replace(/\\/g, "/");

  try {
    // Run PowerShell Compress-Archive
    await runPowerShell(`Compress-Archive -Path '${cleanZipPattern}' -DestinationPath '${cleanZipPath}' -Force`);

    // Get the size of the zipped archive
    if (!fs.existsSync(zipPath)) {
      throw new Error("PowerShell failed to create zip archive.");
    }
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

    // Write Activity Log
    await prisma.activityLog.create({
      data: {
        userId: server.userId,
        action: "RESTORE_SERVER", // Keep action name within original enum types for compatibility: RESTORE_SERVER or Stop/Start
        details: `Created local ${backupType.toLowerCase()} backup '${backupName}' for server '${server.name}' (${fileSizeMB} MB).`
      }
    });

    return finalBackup;
  } catch (err: any) {
    // Clean up DB record if zip creation failed
    await prisma.backup.delete({ where: { id: backup.id } }).catch(() => {});
    throw new Error(`Failed to generate snapshot: ${err.message}`);
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

  const { destExtractDir } = getSavePath(backup.game, backup.serverId);
  const cleanZipPath = backup.filePath.replace(/\\/g, "/");
  const cleanDestDir = destExtractDir.replace(/\\/g, "/");

  // For Minecraft, Enshrouded, Zomboid, ARK, we clear out the existing directory first to ensure a clean restore
  if (backup.game.toUpperCase() !== "VALHEIM") {
    if (fs.existsSync(destExtractDir)) {
      fs.rmSync(destExtractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(destExtractDir, { recursive: true });
  }

  // Expand archive using PowerShell
  await runPowerShell(`Expand-Archive -Path '${cleanZipPath}' -DestinationPath '${cleanDestDir}' -Force`);

  // Write Activity Log
  await prisma.activityLog.create({
    data: {
      userId: backup.userId,
      action: "RESTORE_SERVER",
      details: `Restored local backup '${backup.name}' to server '${backup.server.name}'.`
    }
  });
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
