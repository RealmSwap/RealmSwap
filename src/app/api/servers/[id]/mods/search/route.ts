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

    const game = access.server.game.toUpperCase();
    let results: any[] = [];

    if (game === "VALHEIM") {
      results = await thunderstore.search(query, game);
    } else if (game === "MINECRAFT") {
      results = await modrinth.search(query, game);
    } else if (game === "ZOMBOID") {
      results = await workshop.search(query, game);
    } else {
      return NextResponse.json({ error: "Mod searching is not supported for this game yet." }, { status: 400 });
    }

    return NextResponse.json({ results });

  } catch (error: any) {
    console.error("GET search mods error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
