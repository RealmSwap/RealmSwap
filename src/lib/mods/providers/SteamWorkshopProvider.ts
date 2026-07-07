import { ModProvider, ModSearchResult, SearchOptions } from "./types";
import path from "path";
import fs from "fs";

/**
 * Curated catalogue of popular Steam Workshop mods, keyed by game.
 * The Steam Workshop API requires an API key for real search, so we
 * maintain a hand-picked catalogue of well-known mods that users can
 * browse and filter. Users can always enter Workshop IDs manually for
 * mods not listed here.
 */
const CURATED_MODS: Record<string, Omit<ModSearchResult, "provider">[]> = {
  ZOMBOID: [
    {
      packageId: "2875848298", name: "Common Sense", author: "Braven",
      description: "Allows using crowbars to open doors, opening cans with screwdrivers, and basic QoL items.",
      version: "Workshop", downloadUrl: "",
      categories: ["QoL"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2875848298",
    },
    {
      packageId: "1896907770", name: "Filibuster Rhymes' Used Cars!", author: "Filibuster Rhymes",
      description: "Injects dozens of lore-friendly 80s/90s vehicles, trucks, and vans into spawn tables.",
      version: "Workshop", downloadUrl: "",
      categories: ["Vehicles"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=1896907770",
    },
    {
      packageId: "2904920898", name: "Arsenal(26) GunFighter", author: "Arsenal(26)",
      description: "Adds 100+ firearms with realistic sounds, animations, and attachments.",
      version: "Workshop", downloadUrl: "",
      categories: ["Weapons"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2904920898",
    },
    {
      packageId: "2392987599", name: "Authentic Z - Current", author: "FrankFurt",
      description: "Complete zombie overhaul with new animations, skins, and behavior.",
      version: "Workshop", downloadUrl: "",
      categories: ["Overhaul"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2392987599",
    },
    {
      packageId: "2200148440", name: "Brita's Weapons Pack", author: "Brita",
      description: "Massive weapons pack adding hundreds of guns, melee weapons, and accessories.",
      version: "Workshop", downloadUrl: "",
      categories: ["Weapons"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2200148440",
    },
    {
      packageId: "2313387159", name: "Minimal Display Bars", author: "shark",
      description: "Replaces default moodle system with minimal, customizable display bars for health/hunger/thirst.",
      version: "Workshop", downloadUrl: "",
      categories: ["UI"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2313387159",
    },
    {
      packageId: "2778576730", name: "Craft Helper", author: "b1n0m",
      description: "Shows all recipes that use a selected item, making crafting discovery easier.",
      version: "Workshop", downloadUrl: "",
      categories: ["QoL"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2778576730",
    },
    {
      packageId: "2169435993", name: "Hydrocraft", author: "hydromancerx",
      description: "Massive crafting expansion — 3000+ items including furniture, food, weapons, and electronics.",
      version: "Workshop", downloadUrl: "",
      categories: ["Crafting"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2169435993",
    },
    {
      packageId: "2335368829", name: "More Builds", author: "Tchernobill",
      description: "Expands the building menu with hundreds of new wall, floor, and roof options.",
      version: "Workshop", downloadUrl: "",
      categories: ["Building"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2335368829",
    },
    {
      packageId: "2297098490", name: "Cheat Menu", author: "ethan",
      description: "Admin cheat menu for spawning items, teleporting, and adjusting player stats on the server.",
      version: "Workshop", downloadUrl: "",
      categories: ["Admin"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2297098490",
    },
  ],
};

export class SteamWorkshopProvider implements ModProvider {
  id = "workshop";

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    const gameKey = game.toUpperCase();
    const mods = CURATED_MODS[gameKey];
    if (!mods) return [];

    const offset = options?.offset || 0;
    const categoryFilter = options?.category || "";
    const limit = 20;

    let filtered = mods.map((m) => ({ ...m, provider: this.id })) as ModSearchResult[];

    // Text search
    const q = query.toLowerCase();
    if (q.length > 0) {
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.author.toLowerCase().includes(q) ||
          m.packageId.includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (categoryFilter) {
      filtered = filtered.filter((m) =>
        m.categories?.some(
          (c) => c.toLowerCase() === categoryFilter.toLowerCase()
        )
      );
    }

    // Paginate
    return filtered.slice(offset, offset + limit);
  }

}
