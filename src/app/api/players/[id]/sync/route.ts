import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { syncServerPlayers } from "@/lib/sync/playerSync";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    
    // Check ownership
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server || server.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await syncServerPlayers(serverId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
