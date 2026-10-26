import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { getStatsHistory } from "@/lib/processMonitor";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const { server } = access;
    const history = getStatsHistory(params.id);

    return NextResponse.json({
      cpu: history.cpu,
      memory: history.memory,
      currentCpu: server.cpuUsage,
      currentMemory: server.memoryUsage,
    });
  } catch (error) {
    console.error("GET /api/servers/[id]/stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
