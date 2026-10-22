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
