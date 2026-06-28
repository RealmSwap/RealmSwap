import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { decryptSecret } from "@/lib/hosting/secretStore";
import { getProvider } from "@/lib/hosting/registry";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  if (!access.isOwner) return NextResponse.json({ error: "Only the server owner can manage host transfers" }, { status: 403 });

  const link = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });
  if (!link) return NextResponse.json({ ok: false, error: "No host link configured" }, { status: 400 });

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
    await client.list(link.remoteBasePath);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Connection failed" });
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}
