import { ModProvider, ModSearchResult, SearchOptions } from "./types";

export class CurseForgeProvider implements ModProvider {
  id = "curseforge";

  private apiKey = process.env.CURSEFORGE_API_KEY;
  private baseUrl = "https://api.curseforge.com/v1";

  // Game IDs from CurseForge Core API
  private GAME_IDS: Record<string, number> = {
    "MINECRAFT": 432,
    "ARK": 4328,
    "TERRARIA": 431,
    // Add more mappings as needed
  };

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    if (!this.apiKey) {
      console.warn("CURSEFORGE_API_KEY is not set in environment variables. Falling back to empty results.");
      return [];
    }

    const gameId = this.GAME_IDS[game.toUpperCase()];
    if (!gameId) {
      console.warn(`No CurseForge Game ID mapped for game: ${game}`);
      return [];
    }

    const url = new URL(`${this.baseUrl}/mods/search`);
    url.searchParams.append("gameId", gameId.toString());
    if (query) url.searchParams.append("searchFilter", query);
    
    // Sort by popularity by default
    url.searchParams.append("sortField", "2"); // 2 = Popularity
    url.searchParams.append("sortOrder", "desc");

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "Accept": "application/json",
          "x-api-key": this.apiKey
        }
      });

      if (!res.ok) {
        console.error("CurseForge API error:", res.status, res.statusText);
        return [];
      }

      const data = await res.json();
      
      return data.data.map((mod: any) => ({
        provider: "curseforge",
        packageId: mod.id.toString(),
        name: mod.name,
        author: mod.authors?.[0]?.name || "Unknown",
        description: mod.summary,
        version: mod.latestFiles?.[0]?.displayName || "Unknown",
        downloadUrl: mod.links?.websiteUrl || "", // Redirects to the webpage, actual download requires fileId
        iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || "",
        downloads: mod.downloadCount || 0,
        rating: 5, // CF doesn't provide rating
        categories: mod.categories?.map((c: any) => c.name.toLowerCase()) || [],
        updatedAt: mod.dateModified,
        websiteUrl: mod.links?.websiteUrl || "",
      }));
    } catch (e) {
      console.error("Failed to fetch from CurseForge:", e);
      return [];
    }
  }
}
