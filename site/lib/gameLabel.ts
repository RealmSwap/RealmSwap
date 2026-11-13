/** Human names for the game slugs stored on realms and status snapshots. */
export function gameLabel(game: string): string {
  const labels: Record<string, string> = {
    MINECRAFT: "Minecraft",
    VALHEIM: "Valheim",
    ENSHROUDED: "Enshrouded",
    ZOMBOID: "Project Zomboid",
    ARK: "ARK: Survival Evolved",
    TERRARIA: "Terraria",
    PALWORLD: "Palworld",
    RUST: "Rust",
    SATISFACTORY: "Satisfactory",
    VRISING: "V Rising",
    WINDROSE: "Windrose",
  };
  return labels[game.toUpperCase()] ?? game;
}
