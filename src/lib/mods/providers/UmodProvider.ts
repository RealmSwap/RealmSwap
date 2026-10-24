import { ModProvider, ModSearchResult, SearchOptions } from "./types";
import { searchUmodPlugins, UmodPlugin } from "@/lib/mods/umod";

/**
 * uMod (Oxide) hosts the Rust plugin ecosystem on umod.org. Live search is
 * one cached request per (query, page); when uMod is unreachable or rate
 * limiting, a curated fallback keeps the tab usable (mirrors the Steam
 * Workshop provider's behavior).
 */
export class UmodProvider implements ModProvider {
  id = "umod";

  static supportsGame(game: string): boolean {
    return game.toUpperCase() === "RUST";
  }

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    if (!UmodProvider.supportsGame(game)) return [];

    try {
      const { plugins } = await searchUmodPlugins({ query, offset: options?.offset });
      return plugins.map((p) => this.toResult(p));
    } catch (err) {
      console.error("[uMod] Live search failed — falling back to curated list", err);
      const q = query.toLowerCase();
      return curatedUmodPlugins.filter(
        (p) => !q || p.name.toLowerCase().includes(q) || p.packageId.toLowerCase().includes(q)
      );
    }
  }

  private toResult(p: UmodPlugin): ModSearchResult {
    return {
      provider: this.id,
      packageId: p.name,
      name: p.title,
      author: p.author,
      description: p.description,
      version: p.latestReleaseVersion,
      downloadUrl: p.downloadUrl,
      iconUrl: p.iconUrl,
      downloads: p.downloads,
      categories: p.categoryTags
        ? p.categoryTags.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      updatedAt: p.latestReleaseAt,
      websiteUrl: `https://umod.org/plugins/${p.slug}`,
    };
  }
}

/**
 * Long-standing uMod plugins shown when live search is unavailable. Versions
 * are resolved at install time from the plugin's metadata endpoint.
 */
export const curatedUmodPlugins: (ModSearchResult & { type: string })[] = [
  {
    provider: "umod", packageId: "Kits", name: "Kits", author: "k1lly0u",
    type: "Essentials",
    description: "Give admins and groups one-click loadouts of items, commands and vehicles.",
    version: "", downloadUrl: "https://umod.org/plugins/Kits.cs",
    categories: ["rust"], websiteUrl: "https://umod.org/plugins/rust-kits",
  },
  {
    provider: "umod", packageId: "Clans", name: "Clans", author: "k1lly0u",
    type: "Social",
    description: "Player-created clans with tags, chat, and ally/friendly-fire management.",
    version: "", downloadUrl: "https://umod.org/plugins/Clans.cs",
    categories: ["rust"], websiteUrl: "https://umod.org/plugins/clans",
  },
  {
    provider: "umod", packageId: "Friends", name: "Friends", author: "Nogrod",
    type: "Social",
    description: "Simple friend lists other plugins can build on (door sharing, turrets).",
    version: "", downloadUrl: "https://umod.org/plugins/Friends.cs",
    categories: ["rust"], websiteUrl: "https://umod.org/plugins/friends",
  },
  {
    provider: "umod", packageId: "ImageLibrary", name: "ImageLibrary", author: "Orange",
    type: "Library",
    description: "Icon/image preloader required by many popular Rust plugins.",
    version: "", downloadUrl: "https://umod.org/plugins/ImageLibrary.cs",
    categories: ["rust"], websiteUrl: "https://umod.org/plugins/image-library",
  },
  {
    provider: "umod", packageId: "ServerInfo", name: "ServerInfo", author: "Khan",
    type: "Info",
    description: "In-game info pages: rules, commands, and welcome panels for new players.",
    version: "", downloadUrl: "https://umod.org/plugins/ServerInfo.cs",
    categories: ["rust"], websiteUrl: "https://umod.org/plugins/server-info",
  },
  {
    provider: "umod", packageId: "Backup", name: "Backup", author: "Jake_Rich",
    type: "Maintenance",
    description: "On-demand or scheduled in-game map and player-data backups.",
    version: "", downloadUrl: "https://umod.org/plugins/Backup.cs",
    categories: ["rust"], websiteUrl: "https://umod.org/plugins/backup",
  },
];
