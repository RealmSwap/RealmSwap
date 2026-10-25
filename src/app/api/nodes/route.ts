import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { mintEnrollToken, sha256Hex } from "@/lib/agents/auth";
import { NODE_ONLINE_WINDOW_MS } from "@/lib/agents/protocol";

/**
 * Agent node registry.
 *
 * GET  /api/nodes — any authed member: node list for the deploy-to picker and
 *      the Nodes page. Secrets/tokens never leave the API.
 * POST /api/nodes — ADMIN: mint an enrollment (one-time token, 24h expiry).
 *      The token is returned in plaintext exactly once.
 */

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
});

const ENROLL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function nodeOnline(lastSeenAt: Date | null): boolean {
  return !!lastSeenAt && Date.now() - lastSeenAt.getTime() < NODE_ONLINE_WINDOW_MS;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nodes = await prisma.agentNode.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, status: true, platform: true, arch: true,
      agentVersion: true, dockerVersion: true, lanIp: true,
      totalRamMB: true, freeDiskGB: true, lastSeenAt: true, createdAt: true,
    },
  });

  // What the scheduler needs per node: RAM already promised to RealmSwap
  // servers and how many it hosts (total + running). Everything else about
  // the node's load is invisible to us — see scheduling.ts.
  const [assignments, running] = await Promise.all([
    prisma.server.groupBy({
      by: ["nodeId"],
      where: { runnerType: "AGENT", nodeId: { not: null } },
      _count: { _all: true },
      _sum: { ramAllocation: true },
    }),
    prisma.server.groupBy({
      by: ["nodeId"],
      where: { runnerType: "AGENT", status: { in: ["RUNNING", "STARTING"] } },
      _count: { _all: true },
    }),
  ]);
  const assignedByNode = new Map(assignments.map((a) => [a.nodeId, a]));
  const runningByNode = new Map(running.map((r) => [r.nodeId, r]));

  return NextResponse.json({
    nodes: nodes.map((n) => ({
      ...n,
      online: n.status === "ACTIVE" && nodeOnline(n.lastSeenAt),
      assignedRamGB: assignedByNode.get(n.id)?._sum.ramAllocation ?? 0,
      totalServers: assignedByNode.get(n.id)?._count._all ?? 0,
      runningServers: runningByNode.get(n.id)?._count._all ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A node name (1-64 chars) is required." }, { status: 400 });
  }

  const token = mintEnrollToken();
  const node = await prisma.agentNode.create({
    data: {
      name: parsed.data.name,
      userId: user.id,
      status: "PENDING",
      enrollTokenHash: sha256Hex(token),
      enrollExpiresAt: new Date(Date.now() + ENROLL_TOKEN_TTL_MS),
    },
  });

  return NextResponse.json({
    node: { id: node.id, name: node.name, status: node.status },
    // Only crossing where the enrollment token is ever visible.
    enrollToken: token,
    enrollExpiresAt: node.enrollExpiresAt,
  });
}
