import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { ThunderstoreProvider } from "@/lib/mods/providers/ThunderstoreProvider";
import { ModrinthProvider } from "@/lib/mods/providers/ModrinthProvider";
import { SteamWorkshopProvider } from "@/lib/mods/providers/SteamWorkshopProvider";

// Instantiate singletons for caching
const thunderstore = new ThunderstoreProvider();
const modrinth = new ModrinthProvider();
const workshop = new SteamWorkshopProvider();

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    const offset = parseInt(searchParams.get("offset") || "0");
    const sort = searchParams.get("sort") || "relevance";
    const category = searchParams.get("category") || "";

    const game = access.server.game.toUpperCase();
    const options = { offset, sort, category };
    let results: any[] = [];

    // Route to the appropriate provider based on game
    if (ThunderstoreProvider.supportsGame(game)) {
      results = await thunderstore.search(query, game, options);
    } else if (game === "MINECRAFT") {
      results = await modrinth.search(query, game, options);
    } else if (game === "ZOMBOID") {
      results = await workshop.search(query, game, options);
    } else {
      // Return empty results with a flag instead of a hard error —
      // the frontend shows a friendly "not supported yet" state
      return NextResponse.json({ results: [], unsupported: true });
    }

    return NextResponse.json({ results });

  } catch (error: any) {
    console.error("GET search mods error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
