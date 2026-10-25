import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { prisma } from "@/lib/db";
import { verifyPathAuth } from "@/lib/agents/auth";
import { takeDownloadToken } from "@/lib/agents/agentUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/agents/download/[token] — one-shot pull of a staged restore tar.
 * HMAC path-auth binds the request to the node; the token is single-use and
 * bound to the node+server (issued by the restore orchestrator). The token
 * itself is opaque and 15-min TTL — possession of the URL alone proves
 * nothing without the node's HMAC headers.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const nodeId = req.headers.get("x-node-id");
  const node = nodeId
    ? await prisma.agentNode.findUnique({ where: { id: nodeId } })
    : null;
  const auth = verifyPathAuth(
    { nodeId, timestamp: req.headers.get("x-node-timestamp"), signature: req.headers.get("x-node-signature") },
    "GET",
    `/api/agents/download/${params.token}`,
    node,
  );
  if (!auth.ok) {
    return NextResponse.json({ error: `Download rejected: ${auth.reason}` }, { status: 401 });
  }

  const serverId = req.nextUrl.searchParams.get("serverId") ?? "";
  const transfer = takeDownloadToken(params.token, nodeId!, serverId);
  if (!transfer || !fs.existsSync(transfer.filePath)) {
    return NextResponse.json({ error: "Unknown, used, or expired download token." }, { status: 404 });
  }

  const size = fs.statSync(transfer.filePath).size;
  const stream = Readable.toWeb(fs.createReadStream(transfer.filePath)) as unknown as ReadableStream;
  return new NextResponse(stream as any, {
    status: 200,
    headers: {
      "content-type": "application/x-tar",
      "content-length": String(size),
    },
  });
}
