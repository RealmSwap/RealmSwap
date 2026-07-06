export interface SearchOptions {
  offset?: number;
  sort?: string;    // "relevance" | "downloads" | "rating" | "updated"
  category?: string;
}

export interface ModSearchResult {
  provider: string; // e.g. "thunderstore"
  packageId: string;
  name: string;
  author: string;
  description: string;
  version: string;
  downloadUrl: string;
  iconUrl?: string;
  downloads?: number;      // total download count
  rating?: number;         // rating/score (raw count or 0-100)
  categories?: string[];   // e.g. ["optimization", "utility", "gameplay"]
  updatedAt?: string;      // ISO date of last update
  websiteUrl?: string;     // link to mod page for "View Details"
}

export interface ModProvider {
  id: string; // "thunderstore", "workshop", "manual"
  
  /**
   * Search for mods compatible with the specified game.
   */
  search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]>;
  
  /**
   * Given a package ID and version, return a list of required package IDs.
   * @deprecated Use resolveDependenciesFull for detailed dependencies.
   */
  resolveDependencies(packageId: string, version: string): Promise<string[]>;
  
  /**
   * Given a package ID, return a fully recursive list of dependencies with full details.
   */
  resolveDependenciesFull?(packageId: string, version: string, game: string): Promise<ModSearchResult[]>;
  
  /**
   * Download and extract/install the mod into the specified destination path.
   */
  downloadAndInstall(packageId: string, version: string, destPath: string): Promise<void>;
  
  /**
   * Check a list of installed package IDs for newer versions.
   * Returns a map of packageId -> latestVersion.
   */
  checkForUpdates(packageIds: string[]): Promise<Record<string, string>>;
}
