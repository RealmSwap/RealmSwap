import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { applyForOwner, logPlayerEvent } from "@/lib/players/applyDeps";
import { resolveTargetServerIds } from "./targets";

async function ownedServerIds(ownerId: string): Promise<string[]> {
  const servers = await prisma.server.findMany({ where: { userId: ownerId }, select: { id: true } });
  return servers.map((s) => s.id);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const player = await prisma.player.findFirst({ where: { id: params.id, ownerId: user.id } });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const targets = resolveTargetServerIds(body, await ownedServerIds(user.id));
  if (targets.length === 0) return NextResponse.json({ error: "No target servers" }, { status: 400 });

  for (const serverId of targets) {
    await prisma.playerWhitelist.upsert({
      where: { playerId_serverId: { playerId: player.id, serverId } },
      update: {},
      create: { playerId: player.id, serverId },
    });
  }
  const results = await applyForOwner(user.id, player, { type: "WHITELIST", op: "add" }, { serverIds: targets });
  await logPlayerEvent(player.id, user.id, "WHITELISTED", `Whitelisted on ${targets.length} server(s)`);
  return NextResponse.json({ success: true, results });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const player = await prisma.player.findFirst({ where: { id: params.id, ownerId: user.id } });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const targets = resolveTargetServerIds(body, await ownedServerIds(user.id));

  await prisma.playerWhitelist.deleteMany({ where: { playerId: player.id, serverId: { in: targets } } });
  const results = await applyForOwner(user.id, player, { type: "WHITELIST", op: "remove" }, { serverIds: targets });
  await logPlayerEvent(player.id, user.id, "WHITELIST_REVOKED", `Revoked on ${targets.length} server(s)`);
  return NextResponse.json({ success: true, results });
}
