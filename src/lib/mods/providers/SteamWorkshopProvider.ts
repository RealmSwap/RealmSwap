import { ModProvider, ModSearchResult, SearchOptions } from "./types";
import {
  isWorkshopSearchable, resolveAuthorNames, searchWorkshop, steamApiKey, workshopWebsiteUrl,
} from "@/lib/mods/workshop";
import path from "path";
import fs from "fs";

/**
 * Curated catalogue of popular Steam Workshop mods, keyed by game. Shown as
 * an offline fallback when no STEAM_API_KEY is configured (the Workshop Web
 * API needs a key for search). Users can always enter Workshop IDs manually
 * for mods not listed here. Note: verified against live downloads, some of
 * these display-name mappings are stale — prefer live search when a key is
 * present.
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
  // ARK: Survival Evolved (workshop app 346110) — ids verified via the live
  // Workshop 2026-10-30. Without these the curated fallback (the only path
  // when no STEAM_API_KEY is set) was an empty list for ARK.
  ARK: [
    {
      packageId: "731604991", name: "Structures Plus (S+)", author: "orionsun",
      description: "The classic building overhaul — stackable foundations, auto doors, pick-up structures, and crafting stations.",
      version: "Workshop", downloadUrl: "",
      categories: ["Structures"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=731604991",
    },
    {
      packageId: "1999447172", name: "Super Structures", author: "iSPEZZ",
      description: "Actively maintained S+ fork with even more building pieces, turrets, and QoL for servers.",
      version: "Workshop", downloadUrl: "",
      categories: ["Structures"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=1999447172",
    },
    {
      packageId: "1404697612", name: "Awesome Spyglass!", author: "WJMorjan",
      description: "Spyglass that shows dino/player/structure stats, loot and drop info, with cryo and healing queries.",
      version: "Workshop", downloadUrl: "",
      categories: ["Utilities"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=1404697612",
    },
    {
      packageId: "1609138312", name: "Dino Storage v2", author: "Reaperr",
      description: "Soul-trap tamed dinos into carryable storage balls — offline-feeding, breeding, and mass-release support.",
      version: "Workshop", downloadUrl: "",
      categories: ["Utilities"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=1609138312",
    },
    {
      packageId: "895711211", name: "Classic Flyers", author: "Narcoleptic",
      description: "Restores pre-nerf flyer stats and lets you level speed again. Alters core flyer files — conflicts with other flyer stat mods.",
      version: "Workshop", downloadUrl: "",
      categories: ["Creatures"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=895711211",
    },
  ],
  // tModLoader items (workshop app 1281930) — ids + Both-tags verified via the
  // live Workshop API 2026-10-25.
  TERRARIA: [
    {
      packageId: "2824688072", name: "Calamity Mod", author: "Ozzatron",
      description: "Huge content expansion: new biomes, 30+ bosses, hundreds of items and a post-Moon Lord progression.",
      version: "Workshop", downloadUrl: "",
      categories: ["Both", "new content"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2824688072",
    },
    {
      packageId: "2908170107", name: "Thorium Mod", author: "absoluteAquarian",
      description: "Large content mod with two new classes, new biomes, bosses, and hundreds of items.",
      version: "Workshop", downloadUrl: "",
      categories: ["Both", "new content"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2908170107",
    },
    {
      packageId: "2563309347", name: "Magic Storage", author: "absoluteAquarian",
      description: "Networked crafting storage — one remote-access inventory for all your items and crafting stations.",
      version: "Workshop", downloadUrl: "",
      categories: ["Both", "Utilities"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2563309347",
    },
    {
      packageId: "2669644269", name: "Boss Checklist", author: "javidpack",
      description: "Tracks every boss and event with spawn conditions and progression order.",
      version: "Workshop", downloadUrl: "",
      categories: ["Both", "Utilities"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2669644269",
    },
    {
      packageId: "2619954303", name: "Recipe Browser", author: "javidpack",
      description: "In-game search for every recipe, item and NPC — the reference tool for modded playthroughs.",
      version: "Workshop", downloadUrl: "",
      categories: ["Both", "Utilities"], websiteUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2619954303",
    },
  ],
};

export class SteamWorkshopProvider implements ModProvider {
  id = "workshop";

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    const gameKey = game.toUpperCase();
    const offset = options?.offset || 0;
    const categoryFilter = options?.category || "";
    const limit = 20;

    // Live search when a key is configured; the curated catalogue is the
    // offline fallback (also the only path for games without an AppID).
    if (steamApiKey() && isWorkshopSearchable(gameKey)) {
      try {
        const items = await searchWorkshop({ query, game: gameKey, offset, sort: options?.sort });
        const authors = await resolveAuthorNames(items.map((i) => i.authorSteamId));
        let results: ModSearchResult[] = items.map((i) => ({
          provider: this.id,
          packageId: i.workshopId,
          name: i.title,
          author: authors[i.authorSteamId] ?? i.authorSteamId,
          description: i.description,
          version: i.timeUpdated,
          downloadUrl: "",
          iconUrl: i.previewUrl || undefined,
          downloads: i.subscriptions,
          categories: i.tags,
          updatedAt: i.timeUpdated,
          websiteUrl: workshopWebsiteUrl(i.workshopId),
        }));
        if (categoryFilter) {
          const want = categoryFilter.toLowerCase();
          results = results.filter((m) => m.categories?.some((c) => c.toLowerCase() === want));
        }
        return results.slice(0, limit);
      } catch {
        // Network/API failure — fall through to the curated catalogue so
        // the tab stays usable, mirroring the no-key behavior.
      }
    }

    const mods = CURATED_MODS[gameKey];
    if (!mods) return [];

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

/** Display name for a curated Zomboid workshop file id, or null. Pure data lookup. */
export function curatedZomboidWorkshopName(workshopId: string): string | null {
  for (const mod of CURATED_MODS.ZOMBOID ?? []) {
    if (mod.packageId === workshopId) return mod.name;
  }
  return null;
}
