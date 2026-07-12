import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { decryptSecret } from "@/lib/hosting/secretStore";
import { getProvider } from "@/lib/hosting/registry";
import { walkLocal, walkRemote } from "@/lib/hosting/fsWalk";
import { worldSaveDefaults, isKnownGame } from "@/lib/hosting/worldSaveDefaults";
import { dataRoot } from "@/lib/appPaths";

function parseIncludePaths(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  if (!access.isOwner) return NextResponse.json({ error: "Only the server owner can manage host transfers" }, { status: 403 });
  const { server } = access;

  const direction = req.nextUrl.searchParams.get("direction") === "PULL" ? "PULL" : "PUSH";

  const link = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });
  if (!link) return NextResponse.json({ error: "No host link configured" }, { status: 400 });

  const includePaths = parseIncludePaths(link.includePaths);
  const defaultPaths = worldSaveDefaults(server.game);
  const unknownGame = !isKnownGame(server.game);

  try {
    let tree;
    if (direction === "PUSH") {
      const localRoot = server.localPath || path.join(dataRoot(), "local-servers", server.id);
      tree = await walkLocal(localRoot);
    } else {
      const provider = getProvider(link.provider);
      const client = provider.createClient({
        host: link.host,
        port: link.port,
        username: link.username,
        password: decryptSecret(link.secret),
        remoteBasePath: link.remoteBasePath,
      });
      try {
        await client.connect();
        tree = await walkRemote(client, link.remoteBasePath);
      } finally {
        try { await client.end(); } catch { /* ignore */ }
      }
    }
    return NextResponse.json({ tree, includePaths, defaultPaths, unknownGame });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list files" }, { status: 502 });
  }
}
