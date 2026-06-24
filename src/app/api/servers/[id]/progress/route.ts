import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getProgress } from "@/lib/downloadProgress";
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

    const access = await verifyServerAccess(serverId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    const { server } = access;

    return NextResponse.json({
      status: server.status,
      progress: getProgress(serverId),
    });
  } catch (error) {
    console.error("GET /api/servers/[id]/progress error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
