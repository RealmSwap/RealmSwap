import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import crypto from "crypto";
import { startRealmSyncServer, stopRealmSyncServer } from "@/lib/realmSyncHost";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const server = await prisma.server.findUnique({
      where: { id: params.id, userId: session.id }
    });

    if (!server) return new NextResponse("Server not found", { status: 404 });

    // Start the dedicated sync server
    const { publicIp, port } = await startRealmSyncServer();

    // Generate a random 6-character alphanumeric code
    const rawCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    
    // Store the full connection string so the dashboard can reconstruct the link on reload
    const inviteCode = `${publicIp}:${port}/${rawCode}`;

    const updated = await prisma.server.update({
      where: { id: server.id },
      data: { inviteCode }
    });

    return NextResponse.json({ inviteCode: updated.inviteCode });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const server = await prisma.server.findUnique({
      where: { id: params.id, userId: session.id }
    });

    if (!server) return new NextResponse("Server not found", { status: 404 });

    await prisma.server.update({
      where: { id: server.id },
      data: { inviteCode: null }
    });
    
    // If no other servers have invites, stop the server
    const activeInvites = await prisma.server.count({
      where: { inviteCode: { not: null } }
    });
    
    if (activeInvites === 0) {
      await stopRealmSyncServer();
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
