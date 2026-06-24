import { prisma } from "./db";
import { getRunner } from "./runners";
import { Server } from "@/generated/client";

// Global store for process monitoring intervals and history
const globalForMonitor = globalThis as unknown as {
  monitorIntervals: Map<string, NodeJS.Timeout> | undefined;
  statsHistory: Map<string, { cpu: number[]; memory: number[] }> | undefined;
};

if (!globalForMonitor.monitorIntervals) {
  globalForMonitor.monitorIntervals = new Map();
}
if (!globalForMonitor.statsHistory) {
  globalForMonitor.statsHistory = new Map();
}

const monitorIntervals = globalForMonitor.monitorIntervals;
const statsHistory = globalForMonitor.statsHistory;
const errorCounts = new Map<string, number>();

const MAX_HISTORY = 30; // ~5 minutes at 10s intervals
const SAMPLE_INTERVAL_MS = 10000;

// Start monitoring a server process
export function startMonitoring(server: Server): void {
  const serverId = server.id;
  // Don't duplicate monitors
  if (monitorIntervals.has(serverId)) {
    return;
  }

  // Initialize history
  if (!statsHistory.has(serverId)) {
    statsHistory.set(serverId, { cpu: [], memory: [] });
  }

  const runner = getRunner(server.runnerType);

  const interval = setInterval(async () => {
    try {
      const stats = await runner.getStats(server);
      const history = statsHistory.get(serverId);
      if (history) {
        history.cpu.push(stats.cpuPercent);
        history.memory.push(stats.memoryMB);

        // Cap at MAX_HISTORY
        if (history.cpu.length > MAX_HISTORY) history.cpu.shift();
        if (history.memory.length > MAX_HISTORY) history.memory.shift();
      }

      // Reset error count on success
      if ((errorCounts.get(serverId) || 0) > 0) {
        errorCounts.set(serverId, 0);
        await prisma.server.update({
          where: { id: serverId },
          data: { healthStatus: "OK" }
        }).catch(() => {});
      }

      // Update DB with latest values (convert memoryMB to GB for display)
      await prisma.server.update({
        where: { id: serverId },
        data: {
          cpuUsage: stats.cpuPercent,
          memoryUsage: parseFloat((stats.memoryMB / 1024).toFixed(2)),
        },
      }).catch(() => {}); // Silently fail if server was deleted
    } catch (e: any) {
      // Handle sampling errors
      const fails = (errorCounts.get(serverId) || 0) + 1;
      errorCounts.set(serverId, fails);

      if (fails === 3) { // After 3 consecutive failures (~30s), mark degraded and alert
        console.error(`[Process Monitor Error] Server ${serverId}:`, e.message);
        
        await prisma.server.update({
          where: { id: serverId },
          data: { healthStatus: "DEGRADED" }
        }).catch(() => {});

        const server = await prisma.server.findUnique({ where: { id: serverId } }).catch(() => null);
        if (server) {
          await prisma.activityLog.create({
            data: {
              userId: server.userId,
              action: "SYSTEM_ERROR",
              details: `Process monitoring failed for ${server.name} (DEGRADED). Error: ${e.message}`
            }
          }).catch(() => {});
        }
      }
    }
  }, SAMPLE_INTERVAL_MS);

  monitorIntervals.set(serverId, interval);
}

// Stop monitoring a server process
export function stopMonitoring(serverId: string): void {
  const interval = monitorIntervals.get(serverId);
  if (interval) {
    clearInterval(interval);
    monitorIntervals.delete(serverId);
  }
  // Keep history around briefly so dashboard can still show the last session
}

// Get stats history for a server
export function getStatsHistory(serverId: string): { cpu: number[]; memory: number[] } {
  return statsHistory.get(serverId) || { cpu: [], memory: [] };
}

// Clear stats history (called on fresh start)
export function clearStatsHistory(serverId: string): void {
  statsHistory.delete(serverId);
}
