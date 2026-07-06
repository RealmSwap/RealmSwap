import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { ThunderstoreProvider } from "@/lib/mods/providers/ThunderstoreProvider";
import { ModrinthProvider } from "@/lib/mods/providers/ModrinthProvider";
import { SteamWorkshopProvider } from "@/lib/mods/providers/SteamWorkshopProvider";
import { ModProvider } from "@/lib/mods/providers/types";

// Initialize providers
const providers: Record<string, ModProvider> = {
  thunderstore: new ThunderstoreProvider(),
  modrinth: new ModrinthProvider(),
  workshop: new SteamWorkshopProvider(),
};

// GET /api/servers/[id]/mods/[modId]/dependencies
// Query: ?provider=thunderstore&game=VALHEIM&version=latest
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; modId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;
    const modId = params.modId;

    // Verify access
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("provider") || "thunderstore";
    const game = searchParams.get("game") || access.server.game;
    const version = searchParams.get("version") || "latest";

    const provider = providers[providerId];
    if (!provider) {
      return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });
    }

    if (provider.resolveDependenciesFull) {
      const deps = await provider.resolveDependenciesFull(modId, version, game);
      return NextResponse.json({ dependencies: deps });
    }

    return NextResponse.json({ dependencies: [] });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/mods/[modId]/dependencies error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
