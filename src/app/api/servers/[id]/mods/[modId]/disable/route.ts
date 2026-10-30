import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { toggleModRow } from "@/lib/mods/lifecycle";
import { requireLocalServer } from "@/lib/agents/perimeter";

// POST: disable an installed mod — files stay on disk, the game stops
// loading it (per-game mechanics in lifecycle.ts).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string; modId: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    requireLocalServer(access.server, "Mod toggles");

    const result = await toggleModRow({
      serverId: params.id,
      modId: params.modId,
      userId: user.id,
      game: access.server.game.toUpperCase(),
      serverStatus: access.server.status,
      disabled: true,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      success: true,
      disabled: result.disabled,
      message: `${result.name} disabled — files are kept on disk.`,
    });
  } catch (error: any) {
    console.error(`POST /api/servers/[id]/mods/[modId]/disable error:`, error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
