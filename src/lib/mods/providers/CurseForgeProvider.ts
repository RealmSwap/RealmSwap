import { ModProvider, ModSearchResult, SearchOptions } from "./types";
import {
  CURSEFORGE_GAME_IDS, CURSEFORGE_SORT_FIELDS, CURSEFORGE_CLASS_IDS, curseForgeApiKey,
  searchCurseForgeMods, curseForgeCategoryId,
} from "../curseforge";

export class CurseForgeProvider implements ModProvider {
  id = "curseforge";

  /**
   * Modpack search (classId 4471): one-click full-pack installs ride the
   * install-pack route, which resolves the newest downloadable pack file
   * server-side — the card carries no file pin.
   */
  async searchModpacks(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    const apiKey = curseForgeApiKey();
    if (!apiKey) {
      console.warn("[CurseForge] CURSEFORGE_API_KEY is not set — returning no modpack results.");
      return [];
    }
    const gameId = CURSEFORGE_GAME_IDS[game.toUpperCase()];
    if (!gameId) {
      console.warn(`[CurseForge] No game id mapped for '${game}' — returning no modpack results.`);
      return [];
    }

    try {
      const { data } = await searchCurseForgeMods({
        gameId,
        query,
        offset: options?.offset,
        sortField: CURSEFORGE_SORT_FIELDS.totalDownloads,
        classId: CURSEFORGE_CLASS_IDS.modpacks,
      });
      return data.map((mod) => ({
        provider: this.id,
        packageId: mod.id.toString(),
        name: mod.name,
        author: mod.authors?.[0]?.name || "Unknown",
        description: mod.summary,
        version: mod.latestFilesIndexes?.[0]?.gameVersion || "latest",
        downloadUrl: mod.links?.websiteUrl || "",
        iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || "",
        downloads: mod.downloadCount || 0,
        categories: mod.categories?.map((c) => c.name.toLowerCase()) || [],
        updatedAt: mod.dateModified,
        websiteUrl: mod.links?.websiteUrl || "",
        kind: "modpack",
      }));
    } catch (err) {
      console.error("[CurseForge] Modpack search failed", err);
      return [];
    }
  }

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    const apiKey = curseForgeApiKey();
    if (!apiKey) {
      console.warn("[CurseForge] CURSEFORGE_API_KEY is not set — returning no CurseForge results.");
      return [];
    }

    const gameId = CURSEFORGE_GAME_IDS[game.toUpperCase()];
    if (!gameId) {
      // Unmapped games are usually keys without access — the map only lists
      // games this key can serve (see curseforge.ts).
      console.warn(`[CurseForge] No game id mapped for '${game}' — returning no results.`);
      return [];
    }

    try {
      // Map our sort keys to CFCore sort fields; popularity is the default.
      const sortField =
        options?.sort === "downloads" ? CURSEFORGE_SORT_FIELDS.totalDownloads
        : options?.sort === "updated" ? CURSEFORGE_SORT_FIELDS.lastUpdated
        : options?.sort === "rating" ? CURSEFORGE_SORT_FIELDS.popularity // CF has no rating sort
        : CURSEFORGE_SORT_FIELDS.popularity;

      // CF categories are numeric and game-specific; an unknown slug just
      // means no filter rather than a failed search.
      const categoryId = options?.category
        ? await curseForgeCategoryId(gameId, options.category)
        : undefined;

      const { data } = await searchCurseForgeMods({
        gameId,
        query,
        offset: options?.offset,
        sortField,
        categoryId,
      });

      return data.map((mod) => ({
        provider: this.id,
        packageId: mod.id.toString(),
        name: mod.name,
        author: mod.authors?.[0]?.name || "Unknown",
        description: mod.summary,
        version: mod.latestFiles?.[0]?.displayName || mod.latestFilesIndexes?.[0]?.filename || "latest",
        // Points at the mod page; the actual file is resolved server-side at
        // install time (against the server's MC version and loader).
        downloadUrl: mod.links?.websiteUrl || "",
        iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || "",
        downloads: mod.downloadCount || 0,
        categories: mod.categories?.map((c) => c.name.toLowerCase()) || [],
        updatedAt: mod.dateModified,
        websiteUrl: mod.links?.websiteUrl || "",
      }));
    } catch (err) {
      console.error("[CurseForge] Search failed", err);
      return [];
    }
  }
}
