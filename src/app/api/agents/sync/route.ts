import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySyncAuth, signResponse } from "@/lib/agents/auth";
import { claimPendingCommands, completeCommand } from "@/lib/agents/commands";
import { applyServerReport } from "@/lib/agents/syncState";
import { noteAgentTunnels } from "@/lib/tunnels";
import {
  AGENT_PROTOCOL_VERSION,
  SYNC_LONGPOLL_MS,
  type SyncRequest,
  type SyncResponse,
  type SyncCommand,
  type CommandPayload,
} from "@/lib/agents/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNC_POLL_INTERVAL_MS = 500;

/**
 * POST /api/agents/sync — the single agent channel.
 * Headers: x-node-id, x-node-timestamp (ms epoch), x-node-signature
 * (HMAC-SHA256 over nodeId \n timestamp \n raw body).
 *
 * The request carries capabilities, per-server reports, and command results;
 * the response long-polls (up to 20s) for pending commands and is
 * HMAC-signed back (the agent refuses unsigned responses — commands execute
 * docker on the node, so a forged response would be RCE).
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const nodeId = req.headers.get("x-node-id");
  const node = nodeId
    ? await prisma.agentNode.findUnique({ where: { id: nodeId } })
    : null;

  const auth = verifySyncAuth(
    { nodeId, timestamp: req.headers.get("x-node-timestamp"), signature: req.headers.get("x-node-signature") },
    rawBody,
    node,
  );
  if (!auth.ok) {
    return NextResponse.json({ error: `Sync rejected: ${auth.reason}` }, { status: 401 });
  }
  const secret = node!.secret!;

  let parsed: SyncRequest;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (parsed.protocolVersion !== AGENT_PROTOCOL_VERSION) {
    return NextResponse.json({ error: `Protocol version mismatch (agent ${parsed.protocolVersion}, dashboard ${AGENT_PROTOCOL_VERSION}).` }, { status: 400 });
  }

  // Close out command results first so the agent learns of failures fast.
  for (const result of parsed.results ?? []) {
    if (result && typeof result.commandId === "string") {
      await completeCommand(result.commandId, result.ok === true, result.error, result.output);
    }
  }

  // Node-reported live tunnel daemons feed isTunnelAlive (full set,
  // replaced each sync — a daemon the node no longer runs goes stale here).
  noteAgentTunnels(
    Array.isArray(parsed.tunnelsAlive)
      ? parsed.tunnelsAlive.filter((x: unknown): x is string => typeof x === "string")
      : []
  );

  // Node heartbeat: capabilities + liveness.
  await prisma.agentNode.update({
    where: { id: node!.id },
    data: {
      lastSeenAt: new Date(),
      status: "ACTIVE",
      ...(parsed.platform ? { platform: parsed.platform } : {}),
      ...(parsed.arch ? { arch: parsed.arch } : {}),
      ...(parsed.agentVersion ? { agentVersion: parsed.agentVersion } : {}),
      ...(parsed.dockerVersion !== undefined ? { dockerVersion: parsed.dockerVersion } : {}),
      ...(parsed.lanIp !== undefined ? { lanIp: parsed.lanIp } : {}),
      ...(parsed.totalRamMB != null ? { totalRamMB: Math.round(parsed.totalRamMB) } : {}),
      ...(parsed.freeDiskGB != null ? { freeDiskGB: parsed.freeDiskGB } : {}),
    },
  }).catch(() => {});

  for (const report of parsed.servers ?? []) {
    if (report && typeof report.serverId === "string") {
      await applyServerReport(report, { id: node!.id, lanIp: parsed.lanIp ?? null });
    }
  }

  // Long-poll for work so commands feel instant while the idle cadence stays low.
  const deadline = Date.now() + SYNC_LONGPOLL_MS;
  let rows: Awaited<ReturnType<typeof claimPendingCommands>> = [];
  for (;;) {
    rows = await claimPendingCommands(node!.id);
    if (rows.length > 0 || Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, SYNC_POLL_INTERVAL_MS));
  }

  const commands: SyncCommand[] = [];
  for (const row of rows) {
    let payload: CommandPayload;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      await completeCommand(row.id, false, "Command payload was not valid JSON (dashboard bug).");
      continue;
    }
    commands.push({ id: row.id, type: row.type as SyncCommand["type"], serverId: row.serverId, payload });
  }

  const response: SyncResponse = {
    commands,
    assignedServers: await prisma.server.findMany({
      where: { runnerType: "AGENT", nodeId: node!.id },
      select: { id: true },
    }).then((rows) => rows.map((r) => ({ serverId: r.id }))).catch(() => []),
  };
  const rawResponse = JSON.stringify(response);
  return new NextResponse(rawResponse, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-node-resp-signature": signResponse(secret, rawResponse),
    },
  });
}
