import { prisma } from "./db";
import cronParser from "cron-parser";
import { getRunner } from "./runners";

const globalForScheduler = globalThis as unknown as {
  actionSchedulerInterval: NodeJS.Timeout | undefined;
};

// Check and execute scheduled actions
async function checkScheduledActions() {
  try {
    const now = new Date();
    
    const tasks = await prisma.scheduledTask.findMany({
      where: { enabled: true },
      include: { server: true }
    });

    for (const task of tasks) {
      if (!task.server) continue;

      try {
        const interval = cronParser.parseExpression(task.cronExpression);
        const nextDate = interval.next().toDate();
        const prevDate = interval.prev().toDate(); // the last time it SHOULD have run

        // If it has never run, or the lastRunAt is before prevDate, it's time to run!
        let shouldRun = false;
        
        if (!task.lastRunAt) {
          // If we just created it, we don't want it to run immediately unless we are past the first trigger
          // A safe approach: If prevDate is after createdAt, we run it.
          if (prevDate.getTime() > new Date(task.createdAt).getTime()) {
            shouldRun = true;
          }
        } else if (task.lastRunAt.getTime() < prevDate.getTime()) {
          shouldRun = true;
        }

        // Broadcast logic
        if (task.broadcastMsg && task.broadcastMin && task.broadcastMin > 0) {
          const nextTimeMs = nextDate.getTime();
          const warningTimeMs = nextTimeMs - (task.broadcastMin * 60 * 1000);
          
          if (now.getTime() >= warningTimeMs && now.getTime() < nextTimeMs) {
            // Check if we already broadcasted for this cycle
            if (!task.lastBroadcastAt || task.lastBroadcastAt.getTime() < prevDate.getTime()) {
              console.log(`[Action Scheduler] Broadcasting to ${task.server.name}: ${task.broadcastMsg}`);
              
              // TODO: Implement actual RCON / in-game broadcast
              // await sendRconBroadcast(task.server, task.broadcastMsg);
              
              await prisma.scheduledTask.update({
                where: { id: task.id },
                data: { lastBroadcastAt: now }
              });
            }
          }
        }

        if (shouldRun) {
          console.log(`[Action Scheduler] Executing ${task.action} on '${task.server.name}' (${task.server.game})`);
          
          // Update lastRunAt immediately to prevent duplicate runs
          await prisma.scheduledTask.update({
            where: { id: task.id },
            data: { lastRunAt: now }
          });

          const runner = getRunner(task.server.runnerType);
          
          if (task.action === "START") {
            if (task.server.status !== "RUNNING") await runner.start(task.server, null);
          } else if (task.action === "STOP") {
            if (task.server.status !== "STOPPED") await runner.stop(task.server);
          } else if (task.action === "RESTART") {
            if (task.server.status !== "STOPPED") await runner.stop(task.server);
            // Give it a moment to stop fully
            setTimeout(async () => {
              const updatedServer = await prisma.server.findUnique({ where: { id: task.server.id }});
              if (updatedServer) await runner.start(updatedServer, null);
            }, 5000);
          }

          await prisma.activityLog.create({
            data: {
              userId: task.server.userId,
              action: `${task.action}_SERVER`,
              details: `Automated Scheduled Action executed: ${task.action} on '${task.server.name}'.`,
            },
          }).catch(() => {});
        }

      } catch (parseErr: any) {
        console.error(`[Action Scheduler Error] Invalid cron '${task.cronExpression}' on task ${task.id}:`, parseErr.message);
      }
    }
  } catch (err: any) {
    console.error("[Action Scheduler Error] Failed checking schedules:", err.message);
  }
}

// Initializer
export function initActionScheduler() {
  if (globalForScheduler.actionSchedulerInterval) {
    return; // Already active
  }

  console.log("[Action Scheduler] Initialized background scheduled tasks loop (60s check).");
  
  // Run check immediately on start, then every 60s
  checkScheduledActions().catch(err => console.error("Initial action check failed:", err));
  
  globalForScheduler.actionSchedulerInterval = setInterval(() => {
    checkScheduledActions().catch(err => console.error("Periodic action check failed:", err));
  }, 60000);
}
