import { ModProvider, ModSearchResult, SearchOptions } from "./types";
import path from "path";
import fs from "fs";

export class ModrinthProvider implements ModProvider {
  id = "modrinth";

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    if (game.toUpperCase() !== "MINECRAFT") return [];

    const offset = options?.offset || 0;
    const sort = options?.sort || "relevance";
    const categoryFilter = options?.category || "";
    const limit = 20;

    try {
      // Map our sort keys to Modrinth index values
      const sortMap: Record<string, string> = {
        relevance: "relevance",
        downloads: "downloads",
        rating: "follows",
        updated: "updated",
      };
      const index = sortMap[sort] || "relevance";

      // Build the search URL with pagination and sorting
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        index,
      });

      if (query.trim() !== "") {
        params.set("query", query);
      }

      // Build facets — filter to server-side compatible mods
      const facets: string[][] = [['project_type:mod']];
      if (categoryFilter) {
        facets.push([`categories:${categoryFilter}`]);
      }
      params.set("facets", JSON.stringify(facets));

      const url = `https://api.modrinth.com/v2/search?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to search Modrinth");

      const data = await response.json();

      return data.hits.map((hit: any) => ({
        provider: this.id,
        packageId: hit.project_id,
        name: hit.title,
        author: hit.author,
        description: hit.description,
        version: hit.latest_version || "latest",
        downloadUrl: `https://modrinth.com/mod/${hit.slug}`,
        iconUrl: hit.icon_url || undefined,
        downloads: hit.downloads || 0,
        rating: hit.follows || 0,
        categories: hit.categories || [],
        updatedAt: hit.date_modified,
        websiteUrl: `https://modrinth.com/mod/${hit.slug}`,
      }));
    } catch (err) {
      console.error("[Modrinth] Search failed", err);
      return [];
    }
  }

}
