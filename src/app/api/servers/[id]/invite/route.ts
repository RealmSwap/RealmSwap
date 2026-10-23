import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { generateInviteCodeParts } from "@/lib/realmsync";
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

    // v2 invite: public 8-hex codeId (HTTP path / lookup key) + 128-bit secret
    // that only ever travels inside the realmsync:// deep link, never over HTTP.
    // Retry on the (unlikely) codeId collision with another active invite.
    let codeId = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const parts = generateInviteCodeParts();
      const clash = await prisma.server.findFirst({
        where: { inviteCode: { contains: `/${parts.codeId}` } },
        select: { id: true }
      });
      if (!clash) {
        codeId = parts.codeId;
        const inviteCode = `${publicIp}:${port}/${parts.codeId}${parts.secret}`;
        const updated = await prisma.server.update({
          where: { id: server.id },
          data: { inviteCode }
        });
        return NextResponse.json({ inviteCode: updated.inviteCode });
      }
    }
    return NextResponse.json({ error: "Could not generate a unique invite code. Please try again." }, { status: 500 });
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
