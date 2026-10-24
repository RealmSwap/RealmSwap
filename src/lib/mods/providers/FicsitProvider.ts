import { ModProvider, ModSearchResult, SearchOptions } from "./types";
import { searchFicsitMods, FicsitMod } from "@/lib/mods/ficsit";

/**
 * ficsit.app hosts the Satisfactory mod ecosystem (SML + mods). Its GraphQL
 * API is keyless and unthrottled at our scale, so live search is a plain
 * request — no curated fallback needed (a network failure surfaces as an
 * honest error, unlike umod.org where rate limits force one).
 */
export class FicsitProvider implements ModProvider {
  id = "ficsit";

  static supportsGame(game: string): boolean {
    return game.toUpperCase() === "SATISFACTORY";
  }

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    if (!FicsitProvider.supportsGame(game)) return [];
    const { mods } = await searchFicsitMods({ query, offset: options?.offset });
    return mods.map((m) => this.toResult(m));
  }

  private toResult(m: FicsitMod): ModSearchResult {
    return {
      provider: this.id,
      packageId: m.modReference,
      name: m.name,
      author: "",
      description: "",
      version: m.latestVersion ?? "",
      downloadUrl: "",
      downloads: m.downloads,
      websiteUrl: `https://ficsit.app/mod/${m.modReference}`,
    };
  }
}
