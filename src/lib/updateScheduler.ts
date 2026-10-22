import { prisma } from "./db";
import { sendNotification } from "./notifications";

const globalForScheduler = globalThis as unknown as {
  updateSchedulerInterval: NodeJS.Timeout | undefined;
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Overnight update window: servers with autoUpdate enabled get a SteamCMD
 * app_update while STOPPED, at their configured hour (default 4 AM local).
 * The payoff: starts are instant — nobody waits for a download with friends
 * in the lobby, and a RUNNING server is never touched.
 */
async function checkScheduledUpdates() {
  try {
    const now = new Date();
    const candidates = await prisma.server.findMany({
      where: {
        autoUpdate: true,
        status: "STOPPED",
        runnerType: "LOCAL",
      },
    });

    for (const server of candidates) {
      if (now.getHours() !== server.autoUpdateHour) continue;
      if (server.lastAutoUpdateAt && isSameDay(new Date(server.lastAutoUpdateAt), now)) continue;

      // Claim the slot first so a slow download can't double-trigger.
      await prisma.server.update({
        where: { id: server.id },
        data: { lastAutoUpdateAt: now },
      });

      console.log(`[Update Scheduler] Checking updates for '${server.name}' (${server.game})`);
      try {
        const { runSteamUpdate } = await import("./runners/LocalRunner");
        const result = await runSteamUpdate(server.id);
        if (!result.ran) continue; // non-SteamCMD game — nothing to do

        if (result.updated) {
          await sendNotification(
            server.userId,
            "🔄 Server updated",
            `'${server.name}' was updated to the latest version overnight while stopped. Your next start is instant.`,
            { serverId: server.id }
          );
          await prisma.activityLog.create({
            data: {
              userId: server.userId,
              action: "UPDATE_SERVER",
              details: `Overnight update installed for '${server.name}' (${server.game}).`,
            },
          }).catch(() => {});
        } else if (result.detail) {
          await sendNotification(
            server.userId,
            "⚠️ Update check failed",
            `The overnight update check for '${server.name}' failed: ${result.detail}`,
            { serverId: server.id }
          );
          await prisma.activityLog.create({
            data: {
              userId: server.userId,
              action: "SYSTEM_ERROR",
              details: `Overnight update failed for '${server.name}': ${result.detail}`,
            },
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error(`[Update Scheduler] Failed for '${server.name}':`, err?.message);
      }
    }
  } catch (err) {
    console.error("[Update Scheduler] check failed:", err);
  }
}

export function initUpdateScheduler(): void {
  if (globalForScheduler.updateSchedulerInterval) return;
  globalForScheduler.updateSchedulerInterval = setInterval(checkScheduledUpdates, 15 * 60 * 1000);
  console.log("[Update Scheduler] initialized (15-minute ticks)");
}
