import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { checkUmodPluginUpdate } from "@/lib/mods/umod";

// GET /api/servers/[id]/mods/[modId]/check-update
//
// On-demand update check for providers excluded from the batched updates
// banner. Only uMod uses this today: each plugin check costs one umod.org
// request and the API rate-limits aggressively, so batch checks are
// deliberately impossible — one user-clicked request per plugin (ADMIN-gated
// to protect the shared rate budget, cached 60s against double-clicks) is
// the honest shape.
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string; modId: string }> }
) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }

    const mod = await prisma.modInstallation.findUnique({ where: { id: params.modId } });
    if (!mod || mod.serverId !== serverId) {
      return NextResponse.json({ error: "Mod not found" }, { status: 404 });
    }

    if (mod.provider !== "umod") {
      return NextResponse.json(
        { error: "On-demand checks are for uMod plugins — other providers are covered by the updates banner." },
        { status: 400 }
      );
    }

    const check = await checkUmodPluginUpdate({
      packageId: mod.packageId,
      currentVersion: mod.version,
    });

    return NextResponse.json(check);
  } catch (error: any) {
    console.error("GET check-update error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
