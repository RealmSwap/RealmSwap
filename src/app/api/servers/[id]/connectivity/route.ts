import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { parseSpec } from "@/lib/definitions/serialize";
import { runConnectivityChecks } from "@/lib/connectivityCheck";
import { getPublicIP } from "@/lib/upnp";

// GET: everything the "Connection" dialog needs in one round trip —
// the shareable invite details and a friends-can't-join diagnosis.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ADMIN: the response includes the server password for the share card.
    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }

    const { server } = access;
    const def = server.definitionId
      ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
      : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
    if (!def) return NextResponse.json({ error: "Unsupported game" }, { status: 400 });

    const report = await runConnectivityChecks(server, parseSpec(def.spec));
    const publicIp = await getPublicIP().catch(() => null);

    return NextResponse.json({
      report,
      invite: {
        gameDisplayName: def.displayName,
        serverName: server.name,
        // The address friends type: public IP when the host is reachable that
        // way, the LAN address otherwise (same machine / same network).
        address: publicIp ? `${publicIp}:${server.port}` : `${server.ipAddress}:${server.port}`,
        password: server.password ?? "",
        inviteCode: server.inviteCode ?? null,
      },
    });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/connectivity error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
