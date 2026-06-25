import { ModProvider, ModSearchResult } from "./types";
import path from "path";
import fs from "fs";

export class ThunderstoreProvider implements ModProvider {
  id = "thunderstore";

  private cachedPackages: any[] = [];
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  async search(query: string, game: string): Promise<ModSearchResult[]> {
    if (game.toUpperCase() !== "VALHEIM") return [];
    
    // Fetch and cache the massive package list if needed
    if (this.cachedPackages.length === 0 || Date.now() - this.lastFetchTime > this.CACHE_TTL) {
      console.log("[Thunderstore] Fetching package index...");
      try {
        const response = await fetch("https://valheim.thunderstore.io/api/v1/package/");
        if (response.ok) {
          this.cachedPackages = await response.json();
          this.lastFetchTime = Date.now();
        }
      } catch (err) {
        console.error("[Thunderstore] Failed to fetch packages", err);
      }
    }

    const q = query.toLowerCase();
    
    // If no query, return top 20 by rating score
    let filtered = this.cachedPackages;
    if (q.length > 0) {
      filtered = this.cachedPackages.filter((pkg: any) => 
        pkg.name.toLowerCase().includes(q) || 
        pkg.owner.toLowerCase().includes(q) ||
        pkg.full_name.toLowerCase().includes(q)
      );
    } else {
      // Sort by rating_score desc
      filtered.sort((a, b) => (b.rating_score || 0) - (a.rating_score || 0));
    }

    // Map and return
    const results = filtered
      .slice(0, 20) // top 20
      .map((pkg: any) => {
        // The latest version is the first in the versions array
        const latestVersion = pkg.versions[0];
        return {
          provider: this.id,
          packageId: pkg.full_name,
          name: pkg.name,
          author: pkg.owner,
          description: latestVersion.description,
          version: latestVersion.version_number,
          downloadUrl: latestVersion.download_url
        };
      });

    return results;
  }

  async resolveDependencies(packageId: string, version: string): Promise<string[]> {
    // Mock dependency resolution
    if (packageId === "ValheimPlus-ValheimPlus") {
      return ["denikson-BepInExPack_Valheim"];
    }
    return [];
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
