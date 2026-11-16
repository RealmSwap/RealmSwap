import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { rconManager } from "@/lib/rconManager";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    // RCON when configured, otherwise the shared gamedig query — one live
    // roster for both paths (source tells the UI which answered).
    const { players, source } = await rconManager.getLivePlayers(access.server);

    return NextResponse.json({ players, source });
  } catch (error: any) {
    console.error("GET rcon players error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
