import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { stopMonitoring, clearStatsHistory } from "@/lib/processMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/nodes/[id] — ADMIN: revoke a node. The agent's next sync is
 * rejected (its secret stops working), and any servers still assigned to it
 * are marked CRASHED so they aren't left claiming to run on a dead machine.
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const node = await prisma.agentNode.findUnique({ where: { id: params.id } });
  if (!node) {
    return NextResponse.json({ error: "Node not found." }, { status: 404 });
  }

  await prisma.agentNode.update({
    where: { id: node.id },
    data: { status: "REVOKED", secret: null, enrollTokenHash: null, enrollExpiresAt: null, enrollTokenEnc: null },
  });

  const stranded = await prisma.server.findMany({
    where: { nodeId: node.id, runnerType: "AGENT" },
    select: { id: true, name: true, status: true },
  });
  for (const server of stranded) {
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "CRASHED", pid: null },
    }).catch(() => {});
    // Stop the dashboard-side monitor; the container is unreachable now.
    stopMonitoring(server.id);
    clearStatsHistory(server.id);
  }
  await prisma.agentCommand.updateMany({
    where: { nodeId: node.id, status: { in: ["PENDING", "SENT"] } },
    data: { status: "FAILED", result: JSON.stringify({ ok: false, error: "Node revoked" }) },
  }).catch(() => {});

  return NextResponse.json({ revoked: true, serversAffected: stranded.length });
}
