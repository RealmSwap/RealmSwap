import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { prisma } from "@/lib/db";
import { verifyPathAuth } from "@/lib/agents/auth";
import { agentUploadDir, recordUpload } from "@/lib/agents/agentUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024; // 8 GiB, same cap as realms import

/**
 * POST /api/agents/upload?serverId=<id> — raw transfer endpoint for agent
 * backups. HMAC path-auth in the headers (method+path, not the multi-GB
 * body); the archive is verified structurally before anything trusts it.
 * Streams to disk under dataRoot()/agent-uploads/ and returns a one-shot
 * upload id the agent completes its BACKUP_CREATE command with.
 */
export async function POST(req: NextRequest) {
  const nodeId = req.headers.get("x-node-id");
  const node = nodeId
    ? await prisma.agentNode.findUnique({ where: { id: nodeId } })
    : null;
  const url = new URL(req.url);
  const authPath = `/api/agents/upload${url.search}`;
  const auth = verifyPathAuth(
    { nodeId, timestamp: req.headers.get("x-node-timestamp"), signature: req.headers.get("x-node-signature") },
    "POST",
    authPath,
    node,
  );
  if (!auth.ok) {
    return NextResponse.json({ error: `Upload rejected: ${auth.reason}` }, { status: 401 });
  }

  const serverId = url.searchParams.get("serverId") ?? "";
  if (!/^[a-z0-9]+$/i.test(serverId)) {
    return NextResponse.json({ error: "A valid serverId is required." }, { status: 400 });
  }
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, runnerType: true, nodeId: true },
  });
  if (!server || server.runnerType !== "AGENT" || server.nodeId !== nodeId) {
    return NextResponse.json({ error: "Server is not assigned to this node." }, { status: 403 });
  }

  if (!req.body) {
    return NextResponse.json({ error: "Request body is required." }, { status: 400 });
  }

  fs.mkdirSync(agentUploadDir(), { recursive: true });
  const uploadId = path.basename(await stagedName(serverId));
  const filePath = path.join(agentUploadDir(), `${uploadId}.tar`);

  let received = 0;
  let tooBig = false;
  const source = Readable.fromWeb(req.body as any);
  source.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (received > MAX_UPLOAD_BYTES) {
      tooBig = true;
      source.destroy(new Error(`Upload exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024 * 1024)} GiB cap.`));
    }
  });

  try {
    await pipeline(source, fs.createWriteStream(filePath));
  } catch (err: any) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* best-effort */ }
    if (tooBig) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 });
  }

  if (received === 0) {
    try { fs.unlinkSync(filePath); } catch { /* best-effort */ }
    return NextResponse.json({ error: "Empty upload." }, { status: 400 });
  }

  const id = recordUpload(filePath, nodeId!, serverId);
  return NextResponse.json({ uploadId: id, sizeBytes: received });
}

async function stagedName(serverId: string): Promise<string> {
  return `${serverId}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
