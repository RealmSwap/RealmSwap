export interface ModSearchResult {
  provider: string; // e.g. "thunderstore"
  packageId: string;
  name: string;
  author: string;
  description: string;
  version: string;
  downloadUrl: string;
  iconUrl?: string;
}

export interface ModProvider {
  id: string; // "thunderstore", "workshop", "manual"
  
  /**
   * Search for mods compatible with the specified game.
   */
  search(query: string, game: string): Promise<ModSearchResult[]>;
  
  /**
   * Given a package ID and version, return a list of required package IDs.
   */
  resolveDependencies(packageId: string, version: string): Promise<string[]>;
  
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
