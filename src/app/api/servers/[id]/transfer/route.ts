import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { decryptSecret } from "@/lib/hosting/secretStore";
import { getProvider } from "@/lib/hosting/registry";
import { walkLocal, walkRemote } from "@/lib/hosting/fsWalk";
import { executeTransfer } from "@/lib/hosting/transferService";
import { setProgress, clearProgress } from "@/lib/downloadProgress";
import { getRunner } from "@/lib/runners/factory";
import { dataRoot } from "@/lib/appPaths";
import { FileEntry, SftpClient, TransferDirection, Transferer } from "@/lib/hosting/types";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  const { server } = access;

  const { direction, confirmRemoteStopped } = await req.json();
  if (direction !== "PUSH" && direction !== "PULL") {
    return NextResponse.json({ error: "direction must be PUSH or PULL" }, { status: 400 });
  }
  if (!confirmRemoteStopped) {
    return NextResponse.json({ error: "You must confirm the remote server is stopped" }, { status: 400 });
  }

  const link = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });
  if (!link) return NextResponse.json({ error: "No host link configured" }, { status: 400 });

  // Stop the local server first (mirrors the export route's behavior).
  const runner = getRunner(server.runnerType);
  if (server.status === "RUNNING" || server.status === "STARTING") {
    await runner.stop(server);
    await prisma.server.update({ where: { id: server.id }, data: { status: "STOPPED" } });
  }

  const localRoot = server.localPath || path.join(dataRoot(), "local-servers", server.id);
  const remoteBase = link.remoteBasePath;

  const provider = getProvider(link.provider);
  const client: SftpClient = provider.createClient({
    host: link.host,
    port: link.port,
    username: link.username,
    password: decryptSecret(link.secret),
    remoteBasePath: remoteBase,
  });

  const phase = direction === "PUSH" ? "Uploading" : "Downloading";
  try {
    setProgress(params.id, { phase: "transfer", percent: null, label: `Connecting to ${provider.displayName}...` });
    await client.connect();

    const localEntries = await walkLocal(localRoot);
    const remoteEntries = await walkRemote(client, remoteBase);

    // Build a Transferer that copies in the requested direction, ensuring the
    // parent directory exists on the destination first.
    const makeTransferer = (dir: TransferDirection): Transferer => ({
      async mkdir(rel: string) {
        if (dir === "PUSH") await client.mkdir(path.posix.join(remoteBase, rel));
        else require("fs").mkdirSync(path.join(localRoot, rel), { recursive: true });
      },
      async copy(rel: string) {
        const localPath = path.join(localRoot, rel);
        const remotePath = path.posix.join(remoteBase, rel.split(path.sep).join("/"));
        if (dir === "PUSH") {
          await client.put(localPath, remotePath);
        } else {
          require("fs").mkdirSync(path.dirname(localPath), { recursive: true });
          await client.get(remotePath, localPath);
        }
      },
    });

    const summary = await executeTransfer(direction, {
      excludeConfig: link.excludeConfig,
      localEntries,
      remoteEntries,
      sizesFor: (entries: FileEntry[]) => new Map(entries.map((e) => [e.relPath, e.size])),
      makeTransferer,
      onProgress: (done, total, label) =>
        setProgress(params.id, {
          phase: "transfer",
          percent: total > 0 ? Math.round((done / total) * 100) : null,
          label: `${phase} ${label}`,
        }),
    });

    await prisma.serverHostLink.update({
      where: { serverId: params.id },
      data: {
        lastError: summary.failures.length ? `${summary.failures.length} file(s) failed` : null,
        ...(direction === "PUSH" ? { lastPushAt: new Date() } : { lastPullAt: new Date() }),
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTORE_SERVER",
        details: `${direction === "PUSH" ? "Pushed" : "Pulled"} server '${server.name}' ${direction === "PUSH" ? "to" : "from"} ${provider.displayName} (${summary.filesTransferred} files, ${(summary.bytesTransferred / 1048576).toFixed(1)} MB).`,
      },
    });

    return NextResponse.json({ summary });
  } catch (e: any) {
    await prisma.serverHostLink.update({ where: { serverId: params.id }, data: { lastError: e?.message || "Transfer failed" } }).catch(() => {});
    return NextResponse.json({ error: e?.message || "Transfer failed" }, { status: 500 });
  } finally {
    try { await client.end(); } catch { /* ignore */ }
    clearProgress(params.id);
  }
}
