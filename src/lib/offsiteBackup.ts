import fs from "fs";
import os from "os";
import path from "path";
import { prisma } from "./db";
import { CloudSync, CloudSyncConfig, envCloudSyncConfig, offsiteBackupKey } from "./cloudSync";

/**
 * Offsite (S3) backup replication.
 *
 * Configuration resolves per user — the user's saved settings first, legacy
 * S3_* env vars as fallback. Every attempt's outcome is recorded on the backup
 * row (offsiteStatus PENDING/UPLOADED/FAILED), because a silent failure would
 * be worse than none: an offsite copy you believe exists but doesn't.
 */

export async function resolveOffsiteConfig(userId: string): Promise<CloudSyncConfig | null> {
  const setting = await prisma.s3Setting.findUnique({ where: { userId } });
  if (setting && setting.enabled) {
    return {
      endpoint: setting.endpoint,
      region: setting.region,
      bucket: setting.bucket,
      accessKey: setting.accessKey,
      secretKey: setting.secretKey,
    };
  }
  return envCloudSyncConfig();
}

/**
 * Fire-and-report offsite upload of a freshly created backup. Never throws —
 * the backup itself already succeeded, and the row records the outcome.
 */
export function startOffsiteUpload(
  backupId: string,
  serverId: string,
  ownerUserId: string,
  zipPath: string,
  serverName: string
): void {
  void uploadOffsiteBackup(backupId, serverId, ownerUserId, zipPath, serverName).catch((err) => {
    console.error(`Offsite upload bookkeeping failed for backup ${backupId}:`, err?.message);
  });
}

/** The awaited implementation behind startOffsiteUpload — also the test seam. */
export async function uploadOffsiteBackup(
  backupId: string,
  serverId: string,
  ownerUserId: string,
  zipPath: string,
  serverName: string
): Promise<void> {
  const config = await resolveOffsiteConfig(ownerUserId);
  if (!config) return; // nothing configured — no attempt, row stays honest (null)

  await prisma.backup
    .update({ where: { id: backupId }, data: { offsiteStatus: "PENDING", offsiteError: null } })
    .catch(() => {});

  try {
    const sync = new CloudSync(config);
    await sync.uploadSnapshot(serverId, zipPath);
    await prisma.backup.update({
      where: { id: backupId },
      data: { offsiteStatus: "UPLOADED", offsiteError: null, offsiteUploadedAt: new Date() },
    });
  } catch (err: any) {
    const message = err?.message || "Unknown offsite upload error";
    console.error(`Offsite upload failed for backup ${backupId}: ${message}`);
    await prisma.backup
      .update({ where: { id: backupId }, data: { offsiteStatus: "FAILED", offsiteError: message } })
      .catch(() => {});

    // A failed offsite copy must surface — the local backup alone no longer
    // means "safe" once the user believes an offsite copy exists.
    import("./notifications")
      .then(({ sendNotification }) => {
        sendNotification(
          ownerUserId,
          "☁️ Offsite Backup Failed",
          `The offsite copy of a backup for '${serverName}' could not be uploaded: ${message}`
        );
      })
      .catch((e) => console.error("Failed to load notifications module:", e));

    await prisma.activityLog
      .create({
        data: {
          userId: ownerUserId,
          serverId,
          action: "OFFSITE_BACKUP_FAILED",
          details: `Offsite upload of backup for server '${serverName}' failed: ${message}`,
        },
      })
      .catch(() => {});
  }
}

/**
 * Fetch a backup's offsite copy to a fresh temp zip path for restoring (the
 * "disk died" path — the local file may be long gone). Caller owns cleaning up
 * the returned file's directory.
 */
export async function downloadOffsiteBackup(backupId: string): Promise<string> {
  const backup = await prisma.backup.findUnique({ where: { id: backupId } });
  if (!backup) throw new Error("Backup snapshot not found.");
  if (backup.offsiteStatus !== "UPLOADED") {
    throw new Error("This backup has no offsite copy to download.");
  }

  const config = await resolveOffsiteConfig(backup.userId);
  if (!config) {
    throw new Error("Offsite storage is not configured, so the stored copy cannot be reached.");
  }

  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "realmswap-restore-"));
  const destPath = path.join(destDir, `${backup.id}.zip`);
  try {
    const sync = new CloudSync(config);
    await sync.downloadSnapshot(offsiteBackupKey(backup.serverId, backup.filePath), destPath);
    return destPath;
  } catch (err: any) {
    fs.rmSync(destDir, { recursive: true, force: true });
    throw new Error(`Could not download the offsite copy: ${err?.message || "unknown error"}`);
  }
}
