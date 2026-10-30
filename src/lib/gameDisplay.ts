/**
 * Single source of truth for per-game display bits (icon emoji) and friendly
 * status labels. Every view imports from here — new games get added once and
 * can't end up missing from one screen but not another.
 */

export const GAME_ICONS: Record<string, string> = {
  MINECRAFT: "⛏️",
  VALHEIM: "⛵",
  ENSHROUDED: "🔥",
  ZOMBOID: "🧟",
  ARK: "🦖",
  TERRARIA: "🌳",
  PALWORLD: "🦊",
  RUST: "⚙️",
  SATISFACTORY: "🏭",
  VRISING: "🦇",
  WINDROSE: "🧭",
};

export function gameIcon(game: string): string {
  return GAME_ICONS[game?.toUpperCase?.() ?? ""] ?? "🎮";
}

const GAME_LABELS: Record<string, string> = {
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

/** Raw game enum → human name ("ZOMBOID" → "Project Zomboid"). */
export function gameLabel(game: string): string {
  const key = game?.toUpperCase?.() ?? "";
  if (GAME_LABELS[key]) return GAME_LABELS[key];
  if (!game) return "Custom game";
  return game
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Raw DB statuses translated for humans; enums stay untouched everywhere else. */
export function statusLabel(status: string): string {
  switch (status) {
    case "RUNNING": return "Online";
    case "STARTING": return "Starting…";
    case "UPDATING": return "Updating…";
    case "CRASHED": return "Crashed";
    case "STOPPED": return "Offline";
    default: return status;
  }
}
