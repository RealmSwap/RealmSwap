import { prisma } from "./db";
import { createBackup } from "./backupService";

const globalForScheduler = globalThis as unknown as {
  schedulerInterval: NodeJS.Timeout | undefined;
};

// Periodic backup check
async function checkScheduledBackups() {
  try {
    // Find all running local servers with snapshotInterval enabled (> 0)
    const runningServers = await prisma.server.findMany({
      where: {
        status: "RUNNING",
        snapshotInterval: { gt: 0 }
      }
    });

    if (runningServers.length === 0) return;

    const now = new Date();

    for (const server of runningServers) {
      let shouldBackup = false;

      if (!server.lastSnapshotAt) {
        shouldBackup = true;
      } else {
        const lastBackupTime = new Date(server.lastSnapshotAt).getTime();
        const diffMs = now.getTime() - lastBackupTime;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours >= server.snapshotInterval) {
          shouldBackup = true;
        }
      }

      if (shouldBackup) {
        console.log(`[Backup Scheduler] Triggering automated snapshot for '${server.name}' (${server.game})`);
        
        // Update database state first to prevent duplicate snapshots if zipping is slow
        await prisma.server.update({
          where: { id: server.id },
          data: { lastSnapshotAt: now }
        });

        try {
          await createBackup(server.id, "AUTOMATED");
        } catch (backupErr: any) {
          console.error(`[Backup Scheduler Error] Failed for server '${server.name}':`, backupErr.message);
          // Roll the dedupe timestamp back so the next 60s tick retries
          // instead of silently skipping a full interval.
          await prisma.server.update({
            where: { id: server.id },
            data: { lastSnapshotAt: server.lastSnapshotAt }
          }).catch(() => {});
          // createBackup already notified the user for failures after the DB
          // row exists (its message carries the "Failed to generate snapshot:"
          // wrapper); pre-flight failures (no save files, empty dir) notify here.
          if (!/^Failed to generate snapshot:/.test(backupErr.message)) {
            import("./notifications").then(({ sendNotification }) => {
              sendNotification(server.userId, "❌ Backup Failed", `Automated backup for '${server.name}' failed: ${backupErr.message}`);
            }).catch(() => {});
          }
          await prisma.activityLog.create({
            data: {
              userId: server.userId,
              action: "SYSTEM_ERROR",
              details: `Automated backup failed for ${server.name}: ${backupErr.message}`
            }
          }).catch(() => {}); // Fallback if logging fails
        }
      }
    }
  } catch (err: any) {
    console.error("[Backup Scheduler Error] Failed checking schedules:", err.message);
  }
}

// Initializer
export function initBackupScheduler() {
  if (globalForScheduler.schedulerInterval) {
    return; // Already active
  }

  console.log("[Backup Scheduler] Initialized background local server snapshot polling loop (60s check).");
  
  // Run check immediately on start, then every 60s
  checkScheduledBackups().catch(err => console.error("Initial backup check failed:", err));
  
  globalForScheduler.schedulerInterval = setInterval(() => {
    checkScheduledBackups().catch(err => console.error("Periodic backup check failed:", err));
  }, 60000);
}
