import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { ThunderstoreProvider } from "@/lib/mods/providers/ThunderstoreProvider";
import { ModrinthProvider } from "@/lib/mods/providers/ModrinthProvider";
import { SteamWorkshopProvider } from "@/lib/mods/providers/SteamWorkshopProvider";
import { CurseForgeProvider } from "@/lib/mods/providers/CurseForgeProvider";
import { UmodProvider } from "@/lib/mods/providers/UmodProvider";
import { FicsitProvider } from "@/lib/mods/providers/FicsitProvider";

// Instantiate singletons for caching
const thunderstore = new ThunderstoreProvider();
const ficsit = new FicsitProvider();
const modrinth = new ModrinthProvider();
const workshop = new SteamWorkshopProvider();
const curseforge = new CurseForgeProvider();
const umod = new UmodProvider();

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    const kind = searchParams.get("type") || "mods";
    let results: any[] = [];

    // Route to the appropriate provider based on game
    if (game === "MINECRAFT" && kind === "modpacks") {
      // Browsable pack catalogs: CurseForge's modpack tree (classId 4471) +
      // Modrinth's project_type:modpack, merged and ranked by downloads so
      // the gallery's default (empty-query) view is "the packs people run".
      // Modrinth packs install through the same install-pack pipeline as
      // CurseForge ones (the .mrpack rides planModpackFromZip).
      const [curseforgeResults, modrinthResults] = await Promise.all([
        curseforge.searchModpacks(query, game, options),
        modrinth.searchModpacks(query, game, options),
      ]);
      results = [...curseforgeResults, ...modrinthResults].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    } else if (ThunderstoreProvider.supportsGame(game)) {
      results = await thunderstore.search(query, game, options);
    } else if (game === "MINECRAFT") {
      // Combine Modrinth and CurseForge
      const modrinthResults = await modrinth.search(query, game, options);
      const curseforgeResults = await curseforge.search(query, game, options);
      results = [...modrinthResults, ...curseforgeResults].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    } else if (game === "ZOMBOID" || game === "ARK" || game === "TERRARIA") {
      results = await workshop.search(query, game, options);
    } else if (game === "RUST") {
      results = await umod.search(query, game, options);
    } else if (game === "SATISFACTORY") {
      results = await ficsit.search(query, game, options);
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
