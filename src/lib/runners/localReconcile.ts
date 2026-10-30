import { exec } from "child_process";
import { Server } from "@/generated/client";
import { prisma } from "../db";
import { unmapPort } from "../upnp";
import { startMonitoring } from "../processMonitor";
import { getRunner } from "./factory";
import { appendLog } from "../serverLogs";
import { readProcessSnapshot, isPidAliveTasklist, type ProcessRow } from "./winProcessStats";

/**
 * Boot reconciliation for LOCAL servers — the counterpart of
 * reconcileTunnelsOnBoot / DockerRunner.reconcileOnBoot.
 *
 * Game processes outlive a crashed, updated, or force-quit dashboard
 * (Windows does not kill child processes), while the runner's process map
 * lives in memory. Until this ran, every app restart left the DB lying:
 * dead processes stuck on RUNNING/STARTING (no crash detection, no error),
 * and live orphaned processes the dashboard couldn't see, monitor, or stop.
 *
 * Truth on boot:
 *  - pid dead      -> STOPPED (or stays CRASHED), release its port maps
 *  - pid alive     -> adopt monitor-only: status RUNNING, monitoring works
 *                     (stats + stop by pid); console input can't reattach,
 *                     which the log line says plainly.
 *  - UPDATING      -> the SteamCMD update died with the app; kill any orphan
 *                     downloader and mark STOPPED (the install guard makes
 *                     the next start resume cleanly).
 */
export async function reconcileLocalServersOnBoot(): Promise<void> {
  const servers = await prisma.server.findMany({
    where: {
      runnerType: "LOCAL",
      status: { in: ["RUNNING", "STARTING", "UPDATING", "CRASHED"] },
    },
  });
  if (servers.length === 0) return;

  let snapshot: Map<number, ProcessRow> | null = null;
  try {
    snapshot = (await readProcessSnapshot()).byPid;
  } catch (err: any) {
    console.error("[LocalRunner] boot process snapshot failed, using tasklist:", err?.message);
  }

  for (const server of servers) {
    try {
      await reconcileOne(server, snapshot);
    } catch (err: any) {
      console.error(`[LocalRunner] boot reconcile failed for ${server.id}:`, err?.message);
    }
  }
}

async function killPidTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => exec(`taskkill /F /T /PID ${pid}`, () => resolve()));
}

async function releasePortMaps(server: Server): Promise<void> {
  if (!server.enableUpnp) return;
  appendLog(server.id, "[UPnP] Releasing leftover router port mappings...");
  for (const protocol of ["TCP", "UDP"] as const) {
    await unmapPort(server.port, protocol).catch(() => {});
  }
}

async function reconcileOne(
  server: Server,
  snapshot: Map<number, ProcessRow> | null
): Promise<void> {
  const pid = server.pid ?? 0;
  const alive = pid > 0
    ? snapshot
      ? snapshot.has(pid)
      : await isPidAliveTasklist(pid)
    : false;

  if (server.status === "UPDATING") {
    // The interrupted SteamCMD download can't be resumed mid-flight; any
    // orphan downloader is ours, kill it. The check-file install guard lets
    // the next start pick up where this left off.
    if (alive) await killPidTree(pid);
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "STOPPED", pid: null, cpuUsage: 0, memoryUsage: 0 },
    });
    appendLog(server.id, "[Boot] An update was interrupted by the last app session — marked stopped.");
    return;
  }

  if (alive) {
    // Orphaned but living game server: adopt it monitor-only. We can't
    // reattach its stdio, so console input stays dead until a real restart —
    // but stats, stop, crash-on-disappearance all work again.
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "RUNNING" },
    });
    startMonitoring(server, getRunner(server.runnerType));
    appendLog(
      server.id,
      "[Boot] App restarted while this server was still running — monitoring reattached. Console input needs a restart to come back."
    );
    return;
  }

  if (server.status === "CRASHED") {
    if (pid > 0) {
      await prisma.server.update({ where: { id: server.id }, data: { pid: null } });
    }
    return;
  }

  // Claimed running/starting but the process is gone: it died while the app
  // was down. Crash-vs-clean is unknowable post-mortem; the honest state is
  // STOPPED with the port maps released.
  await prisma.server.update({
    where: { id: server.id },
    data: { status: "STOPPED", pid: null, cpuUsage: 0, memoryUsage: 0 },
  });
  appendLog(server.id, "[Boot] Server was not running after the last app session — marked stopped.");
  await releasePortMaps(server);
}
