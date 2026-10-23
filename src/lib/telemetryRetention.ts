import { prisma } from "./db";

// ServerTelemetry rows are written every 10s for every running server and,
// before this prune existed, were never deleted — every long-running install
// grew the table forever. The only consumers are the HealthSidebar chart
// (last hour) and the 7-day peak-RAM hints in GET /api/servers, so anything
// older than 7 days is ballast.
export const TELEMETRY_RETENTION_DAYS = 7;

// A full backlog delete runs as one DELETE; hourly is plenty for a table
// that grows ~8.6k rows/day per running server.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export function telemetryCutoff(now: number = Date.now()): Date {
  return new Date(now - TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export async function pruneTelemetry(now: number = Date.now()): Promise<number> {
  const result = await prisma.serverTelemetry.deleteMany({
    where: { createdAt: { lt: telemetryCutoff(now) } },
  });
  return result.count;
}

// Throttled, fire-and-forget entry point for hot paths (boot + telemetry
// tick). Never throws into the caller — a failed prune must not break
// monitoring; it just retries on the next throttle window.
const globalForPrune = globalThis as unknown as {
  __telemetryPruneState?: { lastRunAt: number; running: boolean };
};

export function maybePruneTelemetry(now: number = Date.now()): void {
  if (!globalForPrune.__telemetryPruneState) {
    globalForPrune.__telemetryPruneState = { lastRunAt: 0, running: false };
  }
  const state = globalForPrune.__telemetryPruneState;
  if (state.running) return;
  if (now - state.lastRunAt < PRUNE_INTERVAL_MS) return;
  state.running = true;
  state.lastRunAt = now;
  pruneTelemetry(now)
    .then((count) => {
      if (count > 0) {
        console.log(`[telemetryRetention] pruned ${count} rows older than ${TELEMETRY_RETENTION_DAYS} days`);
      }
    })
    .catch((err: any) => {
      console.error("[telemetryRetention] prune failed:", err?.message);
    })
    .finally(() => {
      state.running = false;
    });
}
