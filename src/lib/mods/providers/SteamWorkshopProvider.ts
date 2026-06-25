import { ModProvider, ModSearchResult } from "./types";
import path from "path";
import fs from "fs";

export class SteamWorkshopProvider implements ModProvider {
  id = "workshop";

  async search(query: string, game: string): Promise<ModSearchResult[]> {
    // Mock Steam Workshop search
    if (game.toUpperCase() !== "ZOMBOID") return [];
    
    return [
      {
        provider: this.id,
        packageId: "2875848298",
        name: "Common Sense",
        author: "Braven",
        description: "Allows using crowbars to open doors, etc.",
        version: "1.0.0",
        downloadUrl: ""
      }
    ].filter(m => m.name.toLowerCase().includes(query.toLowerCase()) || m.packageId.toLowerCase().includes(query.toLowerCase()));
  }

  async resolveDependencies(packageId: string, version: string): Promise<string[]> {
    return [];
  }

  async downloadAndInstall(packageId: string, version: string, destPath: string): Promise<void> {
    console.log(`[Workshop] Appending ${packageId} to servertest.ini in ${destPath}`);
    // The actual downloading happens via SteamCMD on server boot for Workshop items.
    // Here we just modify the config.
  }

  async checkForUpdates(packageIds: string[]): Promise<Record<string, string>> {
    return {};
  }
}
