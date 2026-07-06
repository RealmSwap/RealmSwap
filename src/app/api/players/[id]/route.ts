import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = await req.json();
    
    // Check ownership
    const existing = await prisma.player.findUnique({ where: { id: params.id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const player = await prisma.player.update({
      where: { id: params.id },
      data: {
        name: data.name,
        steamId: data.steamId,
        xboxId: data.xboxId,
        minecraftUuid: data.minecraftUuid,
        discordId: data.discordId,
        status: data.status,
        roles: data.roles,
        isGloballyBanned: data.isGloballyBanned,
        globalBanReason: data.globalBanReason
      }
    });

    if (data.isGloballyBanned !== undefined && data.isGloballyBanned !== existing.isGloballyBanned) {
      await prisma.playerAuditLog.create({
        data: {
          playerId: player.id,
          action: data.isGloballyBanned ? "GLOBAL_BAN" : "GLOBAL_UNBAN",
          details: data.globalBanReason || "No reason provided",
          performedBy: user.id
        }
      });
    }

    return NextResponse.json(player);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const existing = await prisma.player.findUnique({ where: { id: params.id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.player.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
