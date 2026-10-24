import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mintNodeSecret, sha256Hex } from "@/lib/agents/auth";
import { AGENT_PROTOCOL_VERSION, type RegisterResponse } from "@/lib/agents/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agents/register — one-time enrollment handshake.
 * Body: { token } (the enrollment token an ADMIN minted on the Nodes page).
 * Returns the node's permanent credentials exactly once. The dashboard keeps
 * the secret encrypted at rest (secretBox); the agent stores its copy locally.
 */
export async function POST(req: Request) {
  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Enrollment token is required." }, { status: 400 });
  }

  const node = await prisma.agentNode.findFirst({
    where: { enrollTokenHash: sha256Hex(token), status: "PENDING" },
  });
  if (!node) {
    return NextResponse.json({ error: "Unknown, used, or expired enrollment token." }, { status: 401 });
  }
  if (node.enrollExpiresAt && node.enrollExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This enrollment token has expired. Mint a new one." }, { status: 401 });
  }

  const secret = mintNodeSecret();
  await prisma.agentNode.update({
    where: { id: node.id },
    data: {
      status: "ACTIVE",
      secret,
      enrollTokenHash: null,
      enrollExpiresAt: null,
    },
  });

  const response: RegisterResponse = {
    nodeId: node.id,
    nodeSecret: secret,
    nodeName: node.name,
    protocolVersion: AGENT_PROTOCOL_VERSION,
  };
  return NextResponse.json(response);
}
