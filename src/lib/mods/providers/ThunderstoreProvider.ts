import { ModProvider, ModSearchResult, SearchOptions } from "./types";
import path from "path";
import fs from "fs";

/**
 * Maps game slugs to Thunderstore community identifiers.
 * Thunderstore hosts mod communities for many games — each with a public
 * package index API at https://{community}.thunderstore.io/api/v1/package/.
 */
const THUNDERSTORE_COMMUNITIES: Record<string, string> = {
  VALHEIM: "valheim",
  VRISING: "v-rising",
  PALWORLD: "palworld",
};

export class ThunderstoreProvider implements ModProvider {
  id = "thunderstore";

  /** Per-community package cache to avoid refetching the full index */
  private cache: Record<string, { packages: any[]; fetchedAt: number }> = {};
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Returns true if the given game has a known Thunderstore community.
   */
  static supportsGame(game: string): boolean {
    return game.toUpperCase() in THUNDERSTORE_COMMUNITIES;
  }

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    const community = THUNDERSTORE_COMMUNITIES[game.toUpperCase()];
    if (!community) return [];

    const offset = options?.offset || 0;
    const sort = options?.sort || "relevance";
    const categoryFilter = options?.category || "";
    const limit = 20;

    // Fetch and cache the full package index for this community
    const cached = this.cache[community];
    if (!cached || Date.now() - cached.fetchedAt > this.CACHE_TTL) {
      console.log(`[Thunderstore] Fetching package index for ${community}...`);
      try {
        const response = await fetch(
          `https://${community}.thunderstore.io/api/v1/package/`
        );
        if (response.ok) {
          this.cache[community] = {
            packages: await response.json(),
            fetchedAt: Date.now(),
          };
        }
      } catch (err) {
        console.error(`[Thunderstore] Failed to fetch packages for ${community}`, err);
      }
    }

    const packages = this.cache[community]?.packages || [];
    let filtered = [...packages];

    // Text search filter
    const q = query.toLowerCase();
    if (q.length > 0) {
      filtered = filtered.filter(
        (pkg: any) =>
          pkg.name.toLowerCase().includes(q) ||
          pkg.owner.toLowerCase().includes(q) ||
          pkg.full_name.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (categoryFilter) {
      filtered = filtered.filter((pkg: any) =>
        pkg.categories?.some(
          (c: string) => c.toLowerCase() === categoryFilter.toLowerCase()
        )
      );
    }

    // Filter out deprecated
    filtered = filtered.filter((pkg: any) => !pkg.is_deprecated);

    // Sorting
    switch (sort) {
      case "downloads":
      case "rating":
        filtered.sort((a, b) => (b.rating_score || 0) - (a.rating_score || 0));
        break;
      case "updated":
        filtered.sort(
          (a, b) =>
            new Date(b.date_updated).getTime() -
            new Date(a.date_updated).getTime()
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
    const results = filtered.slice(offset, offset + limit).map((pkg: any) => {
      const latestVersion = pkg.versions[0];
      return {
        provider: this.id,
        packageId: pkg.full_name,
        name: pkg.name,
        author: pkg.owner,
        description: latestVersion.description,
        version: latestVersion.version_number,
        downloadUrl: latestVersion.download_url,
        iconUrl: latestVersion.icon || undefined,
        rating: pkg.rating_score || 0,
        categories: pkg.categories || [],
        updatedAt: pkg.date_updated,
        websiteUrl: `https://thunderstore.io/c/${community}/p/${pkg.owner}/${pkg.name}/`,
      };
    });

    return results;
  }

  async resolveDependencies(packageId: string, version: string): Promise<string[]> {
    return [];
  }

  async resolveDependenciesFull(packageId: string, version: string, game: string): Promise<ModSearchResult[]> {
    const community = THUNDERSTORE_COMMUNITIES[game.toUpperCase()];
    if (!community) return [];

    // Ensure cache is loaded
    const cached = this.cache[community];
    if (!cached || Date.now() - cached.fetchedAt > this.CACHE_TTL) {
      // Trigger a search just to warm the cache, we can just fetch the index directly
      try {
        const response = await fetch(`https://${community}.thunderstore.io/api/v1/package/`);
        if (response.ok) {
          this.cache[community] = {
            packages: await response.json(),
            fetchedAt: Date.now(),
          };
        }
      } catch (err) {
        console.error(`[Thunderstore] Failed to fetch packages for ${community}`, err);
        return [];
      }
    }

    const packages = this.cache[community]?.packages || [];
    const packageMap = new Map(packages.map((p: any) => [p.full_name, p]));
    
    const results: ModSearchResult[] = [];
    const visited = new Set<string>();

    const resolveRecursive = (currentId: string) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const pkg = packageMap.get(currentId);
      if (!pkg || !pkg.versions || pkg.versions.length === 0) return;

      const latestVersion = pkg.versions[0];
      const deps: string[] = latestVersion.dependencies || [];

      for (const depString of deps) {
        // e.g. "denikson-BepInExPack_Valheim-5.4.2202"
        // The package ID is everything before the last hyphen
        const lastDash = depString.lastIndexOf("-");
        if (lastDash === -1) continue;
        const depId = depString.substring(0, lastDash);

        // Skip BepInEx standard dependencies that are already guaranteed or virtual
        if (depId.startsWith("bbepis-BepInExPack")) continue;

        if (!visited.has(depId)) {
          const depPkg = packageMap.get(depId);
          if (depPkg) {
            const depLatest = depPkg.versions[0];
            results.push({
              provider: this.id,
              packageId: depPkg.full_name,
              name: depPkg.name,
              author: depPkg.owner,
              description: depLatest.description,
              version: depLatest.version_number,
              downloadUrl: depLatest.download_url,
              iconUrl: depLatest.icon || undefined,
              rating: depPkg.rating_score || 0,
              categories: depPkg.categories || [],
              updatedAt: depPkg.date_updated,
              websiteUrl: `https://thunderstore.io/c/${community}/p/${depPkg.owner}/${depPkg.name}/`,
            });
            resolveRecursive(depId);
          }
        }
      }
    };

    resolveRecursive(packageId);
    return results;
  }

  async downloadAndInstall(packageId: string, version: string, destPath: string): Promise<void> {
    // Mock installation - in reality, this would download the ZIP, extract it, and place DLLs in BepInEx/plugins
    console.log(`[Thunderstore] Installing ${packageId}@${version} to ${destPath}`);
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    // Create a dummy DLL to simulate installation
    fs.writeFileSync(path.join(destPath, `${packageId}.dll`), "DUMMY DLL CONTENT");
  }

  async checkForUpdates(packageIds: string[]): Promise<Record<string, string>> {
    // Mock update check
    const updates: Record<string, string> = {};
    if (packageIds.includes("ValheimPlus-ValheimPlus")) {
      updates["ValheimPlus-ValheimPlus"] = "9.11.2"; // Mock newer version
    }
    return updates;
  }
}
