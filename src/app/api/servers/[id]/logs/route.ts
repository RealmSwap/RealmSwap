import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRunner } from "@/lib/runners";
import { verifyServerAccess } from "@/lib/serverAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;

    // Find and verify server access
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    const { server } = access;

    const runner = getRunner(server.runnerType);
    const logs = await runner.getLogs(server);

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("GET /api/servers/[id]/logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
