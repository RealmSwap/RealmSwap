import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { startTunnel, stopTunnel } from "@/lib/tunnels";
import * as crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) return NextResponse.json({ error: "Requires ADMIN role" }, { status: 403 });

    const { server } = access;
    const body = await req.json();

    if (body.action === "TOGGLE_TUNNEL") {
      const enable = !!body.enable;
      
      const updated = await prisma.server.update({
        where: { id: server.id },
        data: { tunnelEnabled: enable }
      });

      if (enable && server.status === "RUNNING") {
        startTunnel(server.id, server.port);
      } else if (!enable) {
        stopTunnel(server.id);
        await prisma.server.update({
          where: { id: server.id },
          data: { tunnelUrl: null }
        });
      }

      return NextResponse.json({ success: true, tunnelEnabled: enable });
    }

    if (body.action === "TOGGLE_AUTO_UPDATE") {
      const enable = !!body.enable;
      
      const updated = await prisma.server.update({
        where: { id: server.id },
        data: { autoUpdate: enable }
      });

      return NextResponse.json({ success: true, autoUpdate: enable });
    }

    if (body.action === "REGENERATE_SFTP") {
      const newPass = crypto.randomBytes(8).toString("hex");
      const updated = await prisma.server.update({
        where: { id: server.id },
        data: { sftpPassword: newPass }
      });
      return NextResponse.json({ success: true, sftpPassword: newPass });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
