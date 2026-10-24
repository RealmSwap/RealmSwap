import { prisma } from "@/lib/db";
import { appendLog } from "@/lib/serverLogs";
import { markFirstOnline } from "@/lib/firstOnline";
import { stopMonitoring, clearStatsHistory } from "@/lib/processMonitor";
import { clearProgress } from "@/lib/downloadProgress";
import { evaluateCrash, isCrashExit, CRASH_MAX_RETRIES, type CrashCounter } from "@/lib/crashPolicy";
import { enqueueCommand } from "./commands";
import { planDockerStart } from "@/lib/runners/docker/planLaunch";
import type { ServerReport } from "./protocol";

/**
 * Apply an agent's per-server reports to the dashboard's rows.
 *
 * The agent is the source of truth for what its docker daemon is doing; this
 * module is where its truth meets the dashboard's rules — only AGENT servers
 * assigned to the reporting node are touched, status transitions mirror
 * DockerRunner's (STARTING → RUNNING via the 5-minute fallback, exit routing
 * through the shared crash policy), and received log lines flow into the same
 * server.log the console SSE reads. Container games declare no readyPattern,
 * so the agent-side fallback is the readiness signal for all of them.
 */

// Crash counters live in this process (same model as the runners' maps);
// a dashboard restart forgets them, which fail-opens to "no restart streak".
const g = globalThis as unknown as { agentCrashCounters: Map<string, CrashCounter> | undefined };
if (!g.agentCrashCounters) g.agentCrashCounters = new Map();
const crashCounters = g.agentCrashCounters;

export interface ReportOutcome {
  applied: boolean;
  skipReason?: "not_agent_server" | "wrong_node" | "missing_server";
  crash?: { exitCode: number | null; restart: boolean; attempt: number } | null;
}

function statusUpdate(serverId: string, status: string, extra: Record<string, unknown> = {}) {
  return prisma.server
    .update({ where: { id: serverId }, data: { status, ...(status === "RUNNING" ? { pendingRestart: false } : {}), ...extra } })
    .catch(() => {});
}

export async function applyServerReport(report: ServerReport, node: { id: string; lanIp: string | null }): Promise<ReportOutcome> {
  const row = await prisma.server.findUnique({ where: { id: report.serverId } }).catch(() => null);
  if (!row) return { applied: false, skipReason: "missing_server" };
  if (row.runnerType !== "AGENT") return { applied: false, skipReason: "not_agent_server" };
  if (row.nodeId !== node.id) return { applied: false, skipReason: "wrong_node" };

  // Stats + logs apply no matter the transition (a RUNNING server keeps
  // reporting while STARTING; telemetry rows are written by the monitor tick
  // from these stored values).
  if (typeof report.cpuPercent === "number" || typeof report.memoryMB === "number") {
    await prisma.server.update({
      where: { id: row.id },
      data: {
        ...(typeof report.cpuPercent === "number" ? { cpuUsage: report.cpuPercent } : {}),
        ...(typeof report.memoryMB === "number" ? { memoryUsage: report.memoryMB } : {}),
      },
    }).catch(() => {});
  }
  for (const line of report.logLines ?? []) {
    appendLog(row.id, line);
  }

  const lanAddress = node.lanIp ? `${node.lanIp}:${row.port}` : null;

  // A fresh `docker run` success: STARTING (DockerRunner parity — the status
  // the start flow sets, awaiting the readiness fallback).
  if (report.started && report.status === "STARTING") {
    if (row.status !== "RUNNING" && row.status !== "UPDATING") {
      await statusUpdate(row.id, "STARTING", { pid: null, cpuUsage: 0, memoryUsage: 0 });
    }
    return { applied: true };
  }

  if (report.status === "RUNNING") {
    // Heartbeats keep saying RUNNING while a dashboard-driven update is in
    // progress — never clobber UPDATING.
    if (row.status !== "UPDATING") {
      await statusUpdate(row.id, "RUNNING", { ...(lanAddress ? { ipAddress: node.lanIp } : {}) });
      markFirstOnline(row.id).catch(() => {});
    }
    return { applied: true };
  }

  if (report.status === "STOPPED") {
    const exitCode = report.exitCode ?? null;
    stopMonitoring(row.id);
    clearStatsHistory(row.id);
    clearProgress(row.id);
    const wasIntentional = report.wasIntentional === true;
    // Container gone without an exit report (agent restart, docker prune):
    // nothing to crash-route — plain STOPPED.
    if (exitCode === null || !isCrashExit(wasIntentional, exitCode)) {
      await statusUpdate(row.id, "STOPPED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
      return { applied: true };
    }

    // Unintended exit → shared crash policy (alert, log, bounded auto-restart).
    const { counter, shouldRestart } = evaluateCrash(crashCounters.get(row.id), Date.now());
    crashCounters.set(row.id, counter);
    appendLog(row.id, `[Crash Detection] Container exited with code ${exitCode} (Attempt ${counter.count}/${CRASH_MAX_RETRIES})`);
    await prisma.activityLog.create({
      data: {
        userId: row.userId,
        serverId: row.id,
        action: "SERVER_CRASH",
        details: `Container '${row.name}' (${row.game}) on node '${node.id}' exited with code ${exitCode}. Auto-restart attempt ${counter.count}/${CRASH_MAX_RETRIES}.`,
        metadata: JSON.stringify({ exitCode, attempt: counter.count, maxRetries: CRASH_MAX_RETRIES }),
      },
    }).catch(() => {});
    import("@/lib/notifications").then(({ sendNotification }) =>
      sendNotification(
        row.userId,
        "⚠️ Server Crashed",
        shouldRestart
          ? `Your container '${row.name}' exited (code ${exitCode}). Auto-restarting (${counter.count}/${CRASH_MAX_RETRIES})…`
          : `Your container '${row.name}' exited (code ${exitCode}) and exhausted all auto-restart attempts.`,
        { serverId: row.id }
      )
    ).catch(() => {});

    if (shouldRestart && row.nodeId) {
      await statusUpdate(row.id, "STARTING", { pid: null, cpuUsage: 0, memoryUsage: 0 });
      try {
        const { payload } = await planDockerStart(row);
        await enqueueCommand(row.nodeId, row.id, "START", payload);
      } catch (err: any) {
        appendLog(row.id, `[Crash Detection] Auto-restart failed to plan: ${err?.message ?? err}`);
        await statusUpdate(row.id, "CRASHED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
        import("@/lib/notifications").then(({ sendNotification }) =>
          sendNotification(
            row.userId,
            "🛑 Auto-restart failed",
            `Your container '${row.name}' crashed and the automatic restart failed: ${err?.message ?? err}`,
            { serverId: row.id }
          )
        ).catch(() => {});
      }
      return { applied: true, crash: { exitCode, restart: true, attempt: counter.count } };
    }
    await statusUpdate(row.id, "CRASHED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
    // Dynamic import — actionScheduler pulls the runner chain via the action registry.
    import("@/lib/actionScheduler").then(({ fireServerCrashAutomations }) =>
      fireServerCrashAutomations(row.id)
    ).catch(() => {});
    return { applied: true, crash: { exitCode, restart: false, attempt: counter.count } };
  }

  // STARTING without `started` — agent between run and fallback; nothing to do.
  return { applied: true };
}
