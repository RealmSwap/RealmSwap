import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const server = await prisma.server.findUnique({ where: { id: serverId } });

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Admins and owners can access
    if (server.userId !== user.id && user.role !== "ADMIN") {
      const isCollab = await prisma.collaborator.findUnique({
        where: { serverId_userId: { serverId, userId: user.id } }
      });
      if (!isCollab) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Last 360 points (~1 hour at 10s sampling). Retention beyond 7 days is
    // handled by src/lib/telemetryRetention.ts; this window is chart-sized.
    const telemetry = await prisma.serverTelemetry.findMany({
      where: { serverId },
      orderBy: { createdAt: "desc" },
      take: 360,
    });

    // Return in chronological order
    return NextResponse.json(telemetry.reverse());
  } catch (error: any) {
    console.error("Telemetry fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
