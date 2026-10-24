import { ModProvider, ModSearchResult, SearchOptions } from "./types";
import {
  communityForGame,
  fetchCommunityIndex,
  newestVersion,
  ThunderstorePackage,
} from "@/lib/mods/thunderstore";

/**
 * Thunderstore hosts mod communities for many games — each with a public
 * package index at https://thunderstore.io/c/{community}/api/v1/package/.
 * Index fetching/caching is shared with the install-time dependency
 * resolver in src/lib/mods/thunderstore.ts.
 */
export class ThunderstoreProvider implements ModProvider {
  id = "thunderstore";

  /**
   * Returns true if the given game has a known Thunderstore community.
   */
  static supportsGame(game: string): boolean {
    return communityForGame(game) !== null;
  }

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    const community = communityForGame(game);
    if (!community) return [];

    let packages: ThunderstorePackage[] = [];
    try {
      packages = await fetchCommunityIndex(community);
    } catch (err) {
      console.error(`[Thunderstore] Failed to fetch packages for ${community}`, err);
      return [];
    }

    const offset = options?.offset || 0;
    const sort = options?.sort || "relevance";
    const categoryFilter = options?.category || "";
    const limit = 20;

    // Desktop mod-manager installers (.msi shells like r2modman/Gale) are
    // not server mods — they'd only ever dead-end at install.
    const MANAGER_PACKAGES = new Set(["ebkr-r2modman", "Kesomannen-GaleModManager"]);
    let filtered = packages.filter((pkg) => !pkg.is_deprecated && !MANAGER_PACKAGES.has(pkg.full_name));

    // Text search filter
    const q = query.toLowerCase();
    if (q.length > 0) {
      filtered = filtered.filter(
        (pkg) =>
          pkg.name.toLowerCase().includes(q) ||
          pkg.owner.toLowerCase().includes(q) ||
          pkg.full_name.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (categoryFilter) {
      filtered = filtered.filter((pkg) =>
        pkg.categories?.some((c) => c.toLowerCase() === categoryFilter.toLowerCase())
      );
    }

    // Sorting
    switch (sort) {
      case "downloads":
      case "rating":
        filtered.sort((a, b) => (b.rating_score || 0) - (a.rating_score || 0));
        break;
      case "updated":
        filtered.sort(
          (a, b) =>
            new Date(b.date_updated).getTime() - new Date(a.date_updated).getTime()
        );
        break;
      default:
        // relevance — if there's a query keep the natural filter order,
        // otherwise fall back to rating score
        if (q.length === 0) {
          filtered.sort((a, b) => (b.rating_score || 0) - (a.rating_score || 0));
        }
    }

    // Paginate and map
    return filtered.slice(offset, offset + limit).map((pkg) => {
      const latestVersion = newestVersion(pkg);
      return {
        provider: this.id,
        packageId: pkg.full_name,
        name: pkg.name,
        author: pkg.owner,
        description: latestVersion?.description ?? "",
        version: latestVersion?.version_number ?? "",
        downloadUrl: latestVersion?.download_url ?? "",
        iconUrl: latestVersion?.icon || undefined,
        rating: pkg.rating_score || 0,
        categories: pkg.categories || [],
        updatedAt: pkg.date_updated,
        websiteUrl: `https://thunderstore.io/c/${community}/p/${pkg.owner}/${pkg.name}/`,
      };
    });
  }
}
