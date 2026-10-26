import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { summarizePlannedSession } from "@/lib/sessions";

// GET /api/servers/[id]/sessions
// Upcoming planned sessions for this server — rows the Discord bot writes
// from /plan commands (title, start time, "I'm In" roster count).
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "VIEWER");
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const sessions = await prisma.plannedSession.findMany({
      where: { serverId: params.id, startTime: { gte: new Date() } },
      orderBy: { startTime: "asc" },
      take: 10,
    });

    return NextResponse.json({
      sessions: sessions.map(summarizePlannedSession),
    });
  } catch (error: any) {
    console.error("Sessions fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
