import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { encryptSecret } from "@/lib/hosting/secretStore";
import { getProvider } from "@/lib/hosting/registry";

function publicLink(link: any) {
  if (!link) return null;
  const { secret, id, serverId, createdAt, updatedAt, includePaths, ...rest } = link;
  return { ...rest, includePaths: parseIncludePaths(includePaths) };
}

function parseIncludePaths(raw: string | null | undefined): string[] {
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

  const link = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });
  return NextResponse.json({ link: publicLink(link) });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  if (!access.isOwner) return NextResponse.json({ error: "Only the server owner can manage host transfers" }, { status: 403 });

  const body = await req.json();
  const provider = body.provider || "AKLIZ";
  const port = parseInt(body.port, 10);

  const existing = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });

  // Validate using the chosen provider. Use the new password if supplied,
  // otherwise a placeholder so validation passes when only editing other fields.
  const creds = {
    host: body.host ?? "",
    port: Number.isNaN(port) ? 22 : port,
    username: body.username ?? "",
    password: body.password || (existing ? "unchanged" : ""),
    remoteBasePath: body.remoteBasePath || ".",
  };
  const err = getProvider(provider).validateCredentials(creds);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const data: any = {
    provider,
    host: creds.host,
    port: creds.port,
    username: creds.username,
    remoteBasePath: creds.remoteBasePath,
  };
  if (body.password) data.secret = encryptSecret(body.password);
  if (Array.isArray(body.includePaths)) {
    data.includePaths = JSON.stringify(body.includePaths.filter((x: unknown) => typeof x === "string"));
  }

  let link;
  if (existing) {
    link = await prisma.serverHostLink.update({ where: { serverId: params.id }, data });
  } else {
    if (!body.password) return NextResponse.json({ error: "Password is required" }, { status: 400 });
    link = await prisma.serverHostLink.create({ data: { ...data, serverId: params.id } });
  }

  return NextResponse.json({ link: publicLink(link) });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  if (!access.isOwner) return NextResponse.json({ error: "Only the server owner can manage host transfers" }, { status: 403 });

  await prisma.serverHostLink.deleteMany({ where: { serverId: params.id } });
  return NextResponse.json({ ok: true });
}
