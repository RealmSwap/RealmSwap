import { prisma } from "@/lib/db";
import { appendLog, getServerLogTail } from "@/lib/serverLogs";
import { clearProgress } from "@/lib/downloadProgress";
import { startMonitoring } from "@/lib/processMonitor";
import { enqueueCommand, awaitCommandResult } from "@/lib/agents/commands";
import { NODE_ONLINE_WINDOW_MS, type CommandPayload } from "@/lib/agents/protocol";
import { planDockerStart, planDockerUpdate, resolveDefinition } from "./docker/planLaunch";
import type { ServerRunner, ProcessStats } from "./types";
import type { Server } from "@/generated/client";

/**
 * Runs servers on a remote AgentNode. Implements the same ServerRunner verbs
 * as Local/Docker, but everything executes over the agent protocol: enqueue a
 * fully-planned command, wait for the node to claim and close it. The agent
 * reports status/stats/logs back through /api/agents/sync; this runner's
 * getStats reads what the agent last reported, and getLogs reads the same
 * server.log the sync stream appends to — so the console, telemetry, and
 * SSE surfaces work unchanged.
 */

async function getNode(serverId: string) {
  const row = await prisma.server.findUnique({
    where: { id: serverId },
    select: { nodeId: true },
  });
  if (!row?.nodeId) throw new Error("Server has no node assigned.");
  const node = await prisma.agentNode.findUnique({ where: { id: row.nodeId } });
  if (!node) throw new Error("Assigned node no longer exists.");
  return node;
}

function assertNodeUsable(node: { status: string; secret: string | null; name: string }): void {
  if (node.status !== "ACTIVE" || !node.secret) {
    throw new Error(`Node '${node.name}' has not completed enrollment.`);
  }
}

function isOnline(node: { lastSeenAt: Date | null }): boolean {
  return !!node.lastSeenAt && Date.now() - node.lastSeenAt.getTime() < NODE_ONLINE_WINDOW_MS;
}

export class RemoteRunner implements ServerRunner {
  // Install is implicit on remote nodes: the container entrypoint runs
  // SteamCMD on every start, exactly like the Docker runner.
  async install(): Promise<void> {}

  private async enqueueAndAwait(
    serverId: string,
    type: "START" | "STOP" | "UPDATE" | "SEND_COMMAND",
    payload: CommandPayload,
    timeoutMs: number
  ) {
    const node = await getNode(serverId);
    assertNodeUsable(node);
    if (!isOnline(node)) {
      throw new Error(`Node '${node.name}' is offline (last seen ${node.lastSeenAt?.toISOString() ?? "never"}).`);
    }
    const { id } = await enqueueCommand(node.id, serverId, type, payload);
    return awaitCommandResult(id, timeoutMs);
  }

  async start(server: Server): Promise<void> {
    const record = await prisma.server.findUnique({ where: { id: server.id } });
    if (!record) throw new Error("Server record not found in database.");

    let payload: CommandPayload;
    try {
      payload = (await planDockerStart(record)).payload;
    } catch (err: any) {
      appendLog(record.id, `[Remote] Failed to plan start: ${err?.message ?? err}`);
      await prisma.server.update({ where: { id: record.id }, data: { status: "STOPPED", pid: null } }).catch(() => {});
      throw err;
    }

    await prisma.server.update({ where: { id: record.id }, data: { status: "STARTING", pid: null, cpuUsage: 0, memoryUsage: 0 } }).catch(() => {});
    appendLog(record.id, `[Remote] Dispatching start to agent node…`);

    const outcome = await this.enqueueAndAwait(record.id, "START", payload, 60000);
    if (!outcome.ok) {
      clearProgress(record.id);
      appendLog(record.id, `[Remote] Start failed: ${outcome.error ?? outcome.status}`);
      await prisma.server.update({ where: { id: record.id }, data: { status: "STOPPED", pid: null } }).catch(() => {});
      throw new Error(`Failed to start on remote node: ${outcome.error ?? outcome.status}`);
    }
    // The agent reports STARTING/RUNNING via sync; the monitor reads
    // agent-reported stats from the row.
    startMonitoring(record, this);
  }

  async stop(server: Server): Promise<void> {
    // Best-effort graceful in-game shutdown first, mirroring the Docker runner.
    const record = await prisma.server.findUnique({ where: { id: server.id } });
    if (!record) throw new Error("Server not found");
    let stdinStopCommand: string | null = null;
    try {
      const { spec } = await resolveDefinition(record);
      stdinStopCommand = spec.launch.stdinStopCommand?.replace(/\n$/, "") ?? null;
    } catch { /* fall through to plain docker stop */ }

    const outcome = await this.enqueueAndAwait(
      server.id, "STOP",
      { kind: "STOP", containerName: `realmswap-server-${server.id}`, stdinStopCommand },
      30000,
    );
    if (!outcome.ok) throw new Error(`Failed to stop on remote node: ${outcome.error ?? outcome.status}`);
    // The STOPPED transition (intentional) lands via the agent's exit report.
  }

  async update(server: Server): Promise<void> {
    const record = await prisma.server.findUnique({ where: { id: server.id } });
    if (!record) throw new Error("Server not found");
    const { payload } = await planDockerUpdate(record);

    await prisma.server.update({ where: { id: record.id }, data: { status: "UPDATING" } }).catch(() => {});
    appendLog(record.id, `[Remote] Dispatching SteamCMD update to agent node…`);
    const outcome = await this.enqueueAndAwait(record.id, "UPDATE", payload, 15 * 60 * 1000);
    if (!outcome.ok) {
      await prisma.server.update({ where: { id: record.id }, data: { status: "STOPPED" } }).catch(() => {});
      throw new Error(`SteamCMD update failed on remote node: ${outcome.error ?? outcome.status}`);
    }
    appendLog(record.id, "[Remote] Update completed successfully.");
    await prisma.server.update({ where: { id: record.id }, data: { status: "STOPPED" } }).catch(() => {});
  }

  async sendCommand(server: Server, command: string): Promise<void> {
    const outcome = await this.enqueueAndAwait(
      server.id, "SEND_COMMAND",
      { kind: "SEND_COMMAND", containerName: `realmswap-server-${server.id}`, command },
      10000,
    );
    if (!outcome.ok) throw new Error(`Failed to send command via agent: ${outcome.error ?? outcome.status}`);
  }

  /**
   * Stats are agent-reported (sync writes them onto the row); the monitor's
   * 10s tick reads them here. Stale node → throw, which routes to the
   * monitor's DEGRADED path instead of recording fake zeros.
   */
  async getStats(server: Server): Promise<ProcessStats> {
    const node = await getNode(server.id);
    if (!isOnline(node)) {
      throw new Error(`Node '${node.name}' is offline — no fresh telemetry.`);
    }
    const row = await prisma.server.findUnique({
      where: { id: server.id },
      select: { cpuUsage: true, memoryUsage: true },
    });
    return { cpuPercent: row?.cpuUsage ?? 0, memoryMB: row?.memoryUsage ?? 0 };
  }

  async getLogs(server: Server): Promise<string> {
    // Agent-reported log lines are appended into the dashboard's server.log,
    // so the console pipeline (tail + SSE + archives) works unchanged.
    return getServerLogTail(server.id);
  }
}
