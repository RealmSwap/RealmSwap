import { prisma } from "@/lib/db";
import { NODE_ONLINE_WINDOW_MS, type CommandPayload } from "./protocol";

/**
 * The dashboard→agent work queue, drained by the agent's sync loop. The agent
 * dials home; nothing ever listens on the node. Commands are small rows the
 * sync endpoint hands out (PENDING → SENT) and the agent closes (→ DONE/FAILED
 * with a JSON result). A SENT command older than the reclaim window is
 * re-queued — the agent may have died between pickup and execution.
 */

const RECLAIM_SENT_AFTER_MS = 60000;
const RESULT_POLL_MS = 500;

/** Node checks shared by every dispatcher that enqueues commands directly
 *  (backup flows, RemoteRunner has its own private copy). Throws with a
 *  message the user can act on. */
export async function resolveUsableNode(serverId: string) {
  const row = await prisma.server.findUnique({ where: { id: serverId }, select: { nodeId: true } });
  if (!row?.nodeId) throw new Error("Server has no node assigned.");
  const node = await prisma.agentNode.findUnique({ where: { id: row.nodeId } });
  if (!node) throw new Error("Assigned node no longer exists.");
  if (node.status !== "ACTIVE" || !node.secret) {
    throw new Error(`Node '${node.name}' has not completed enrollment.`);
  }
  if (!node.lastSeenAt || Date.now() - node.lastSeenAt.getTime() > NODE_ONLINE_WINDOW_MS) {
    throw new Error(`Node '${node.name}' is offline (last seen ${node.lastSeenAt?.toISOString() ?? "never"}).`);
  }
  return node;
}

export type AgentCommandType =
  | "START"
  | "STOP"
  | "UPDATE"
  | "SEND_COMMAND"
  | "BACKUP_CREATE"
  | "BACKUP_RESTORE"
  | "FILE_READ"
  | "FILE_WRITE"
  | "FILE_LIST"
  | "CONFIG_APPLY";

export async function enqueueCommand(
  nodeId: string,
  serverId: string,
  type: AgentCommandType,
  payload: CommandPayload
): Promise<{ id: string }> {
  const row = await prisma.agentCommand.create({
    data: { nodeId, serverId, type, payload: JSON.stringify(payload), status: "PENDING" },
    select: { id: true },
  });
  return { id: row.id };
}

export interface CommandOutcome {
  ok: boolean;
  error?: string;
  output?: string;
  status: "DONE" | "FAILED" | "TIMEOUT";
}

/** Poll a command row until the agent closes it or the timeout lapses. */
export async function awaitCommandResult(commandId: string, timeoutMs: number): Promise<CommandOutcome> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.agentCommand.findUnique({
      where: { id: commandId },
      select: { status: true, result: true },
    });
    if (!row) return { ok: false, error: "Command row vanished", status: "FAILED" };
    if (row.status === "DONE" || row.status === "FAILED") {
      let parsed: { ok?: boolean; error?: string; output?: string } = {};
      try { parsed = row.result ? JSON.parse(row.result) : {}; } catch { /* unparseable → failed shape */ }
      const ok = row.status === "DONE" && parsed.ok !== false;
      return { ok, error: parsed.error, output: parsed.output, status: row.status as "DONE" | "FAILED" };
    }
    if (Date.now() >= deadline) return { ok: false, error: "Agent did not complete the command in time", status: "TIMEOUT" };
    await new Promise((r) => setTimeout(r, RESULT_POLL_MS));
  }
}

/**
 * Commands ready for pickup: PENDING, or SENT-but-stale (agent died after
 * claiming). Returned in FIFO order and marked SENT.
 */
export async function claimPendingCommands(nodeId: string, limit = 10) {
  const staleSentBefore = new Date(Date.now() - RECLAIM_SENT_AFTER_MS);
  const rows = await prisma.agentCommand.findMany({
    where: {
      nodeId,
      OR: [{ status: "PENDING" }, { status: "SENT", sentAt: { lt: staleSentBefore } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (rows.length === 0) return [];
  await prisma.agentCommand.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { status: "SENT", sentAt: new Date() },
  });
  return rows;
}

export async function completeCommand(id: string, ok: boolean, error?: string, output?: string): Promise<void> {
  await prisma.agentCommand.update({
    where: { id },
    data: {
      status: ok ? "DONE" : "FAILED",
      result: JSON.stringify({ ok, error, output }),
      completedAt: new Date(),
    },
  }).catch(() => {});
}
