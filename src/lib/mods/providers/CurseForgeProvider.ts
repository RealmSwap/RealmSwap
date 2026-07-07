import { ModProvider, ModSearchResult, SearchOptions } from "./types";

export class CurseForgeProvider implements ModProvider {
  id = "curseforge";

  // Mock data for CurseForge
  private mockMods: ModSearchResult[] = [
    {
      provider: "curseforge",
      packageId: "238222",
      name: "Just Enough Items (JEI)",
      author: "mezz",
      description: "Item and recipe viewing mod.",
      version: "1.20.1-15.3.0.4",
      downloadUrl: "https://www.curseforge.com/minecraft/mc-mods/jei",
      iconUrl: "https://media.forgecdn.net/avatars/4/527/635351433946029555.png",
      downloads: 250000000,
      rating: 5,
      categories: ["utility"],
      updatedAt: new Date().toISOString(),
      websiteUrl: "https://www.curseforge.com/minecraft/mc-mods/jei",
    },
    {
      provider: "curseforge",
      packageId: "228751",
      name: "Waystones",
      author: "BlayTheNinth",
      description: "Craftable pillars that players can use to teleport between.",
      version: "1.20.1-14.1.0",
      downloadUrl: "https://www.curseforge.com/minecraft/mc-mods/waystones",
      iconUrl: "https://media.forgecdn.net/avatars/53/782/636155979507968565.png",
      downloads: 120000000,
      rating: 5,
      categories: ["magic", "utility"],
      updatedAt: new Date().toISOString(),
      websiteUrl: "https://www.curseforge.com/minecraft/mc-mods/waystones",
    },
    {
      provider: "curseforge",
      packageId: "248787",
      name: "AppleSkin",
      author: "squeek502",
      description: "Adds food value information to tooltips.",
      version: "1.20.1-2.5.1",
      downloadUrl: "https://www.curseforge.com/minecraft/mc-mods/appleskin",
      iconUrl: "https://media.forgecdn.net/avatars/61/899/636163351910243405.png",
      downloads: 180000000,
      rating: 5,
      categories: ["utility"],
      updatedAt: new Date().toISOString(),
      websiteUrl: "https://www.curseforge.com/minecraft/mc-mods/appleskin",
    }
  ];

  async search(query: string, game: string, options?: SearchOptions): Promise<ModSearchResult[]> {
    // Only support Minecraft and ARK for this mock
    if (game.toUpperCase() !== "MINECRAFT" && game.toUpperCase() !== "ARK") return [];

    let results = [...this.mockMods];

    if (query.trim() !== "") {
      const lowerQuery = query.toLowerCase();
      results = results.filter(mod => 
        mod.name.toLowerCase().includes(lowerQuery) || 
        mod.description.toLowerCase().includes(lowerQuery)
      );
    }

    if (options?.category) {
      results = results.filter(mod => mod.categories?.includes(options.category!));
    }

    return results;
  }
}
