import { prisma } from "@/lib/db";
import { getRunner } from "@/lib/runners";
import { claimStart, releaseStart } from "@/lib/runners/startClaims";
import { serverEventBus } from "@/lib/eventBus";

const BUSY_STATUSES = ["RUNNING", "STARTING", "UPDATING"];

export interface AutoStartLaunchResult {
  started: string[];
  failed: { serverId: string; error: string }[];
}

/**
 * Dedicated-box half of "the old laptop in the closet": servers marked
 * autoStartOnLaunch boot with the app. Runs from instrumentation AFTER
 * reconcileLocalServersOnBoot — statuses are only truthful once that pass
 * has marked dead-process rows STOPPED — and only for LOCAL servers in
 * STOPPED state (CRASHED stays put; auto-starting a crashed server would
 * hide the crash from the person who eventually opens the dashboard).
 *
 * Mirrors the start route's semantics: single-flight claim, autoUpdate
 * servers update before booting (non-Minecraft), tunnel starts after the
 * process is up (a tunnel failure never fails the start), and a failed
 * start resets the row to STOPPED instead of stranding it on STARTING.
 * Never throws — a dedicated box must come up even if one server can't.
 */
export async function autoStartServersOnLaunch(): Promise<AutoStartLaunchResult> {
  const servers = await prisma.server.findMany({
    where: { runnerType: "LOCAL", autoStartOnLaunch: true, status: "STOPPED" },
    orderBy: { name: "asc" },
  });

  const started: string[] = [];
  const failed: { serverId: string; error: string }[] = [];

  for (const server of servers) {
    // A start/restart/update already in flight for this id owns the claim.
    if (!claimStart(server.id)) continue;
    try {
      const fresh = await prisma.server.findUnique({ where: { id: server.id } });
      if (!fresh || fresh.status !== "STOPPED" || BUSY_STATUSES.includes(fresh.status)) continue;

      const runner = getRunner(fresh.runnerType);
      if (fresh.autoUpdate && fresh.game.toUpperCase() !== "MINECRAFT") {
        await runner.update(fresh, null);
        await runner.start(fresh, null);
      } else {
        await runner.start(fresh, null);
      }
      started.push(server.id);

      await prisma.activityLog.create({
        data: {
          userId: server.userId,
          serverId: server.id,
          action: "AUTO_START_SERVER",
          details: `Started '${server.name}' (${server.game}) automatically at app launch (dedicated box).`,
        },
      }).catch(() => {});

      if (fresh.tunnelEnabled) {
        const { startTunnel } = await import("@/lib/tunnels");
        const tunnelResult = await startTunnel(fresh.id, fresh.port).catch((err: any) => {
          console.error(`[AutoStart] tunnel failed for ${fresh.id}:`, err?.message);
          return { ok: false as const, error: String(err?.message ?? err) };
        });
        if (!tunnelResult.ok) {
          console.error(`[AutoStart] tunnel failed for ${fresh.id}: ${tunnelResult.error}`);
        }
      }
    } catch (err: any) {
      failed.push({ serverId: server.id, error: err?.message ?? String(err) });
      console.error(`[AutoStart] failed to start ${server.id}:`, err?.message);
      await prisma.server.update({
        where: { id: server.id },
        data: { status: "STOPPED", pid: null, cpuUsage: 0, memoryUsage: 0 },
      }).catch(() => {});
      serverEventBus.emit("status_update", { serverId: server.id, status: "STOPPED" });
    } finally {
      releaseStart(server.id);
    }
  }

  return { started, failed };
}
