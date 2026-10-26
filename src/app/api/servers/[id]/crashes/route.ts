import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";

/**
 * Per-server crash history for the Crash History panel: SERVER_CRASH activity
 * entries (written with structured metadata by both runners) plus a rolling
 * 7-day count for the summary line.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await verifyServerAccess(params.id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Server not found" }, { status: 403 });
  }

  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [crashes, weekCount] = await Promise.all([
      prisma.activityLog.findMany({
        where: { serverId: params.id, action: "SERVER_CRASH" },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, details: true, metadata: true, createdAt: true },
      }),
      prisma.activityLog.count({
        where: { serverId: params.id, action: "SERVER_CRASH", createdAt: { gte: weekAgo } },
      }),
    ]);
    return NextResponse.json({ crashes, weekCount });
  } catch (err: any) {
    console.error("Crash history fetch failed:", err);
    return NextResponse.json({ error: `Failed to load crash history: ${err.message}` }, { status: 500 });
  }
}
