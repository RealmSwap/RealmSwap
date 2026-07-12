// World-save data locations per game, as POSIX paths relative to the server's
// transfer base (the local server dir / the host's remoteBasePath — they
// mirror each other). Used to pre-check the transfer file picker.
//
// Keep conceptually in sync with src/lib/backupPaths.ts (getSavePath), which
// holds the same knowledge as absolute, backup-shaped paths. An empty array
// means "no known in-tree save location" — the picker then leaves nothing
// pre-checked (games that save outside the server dir) or falls back to
// everything (unknown games); the caller decides.
const DEFAULTS: Record<string, string[]> = {
  PALWORLD: ["palworld-server/Pal/Saved/SaveGames"],
  MINECRAFT: ["world"],
  ENSHROUDED: ["enshrouded-server/savegame"],
  ARK: ["ark-server/ShooterGame/Saved/SavedArksLocal"],
  ZOMBOID: ["zomboid-server/zomboid-data/Saves"],
  // VALHEIM saves under the Windows user profile, not the server dir → no default.
};

export function worldSaveDefaults(game: string): string[] {
  return DEFAULTS[game.toUpperCase()] ?? [];
}

// Whether the game is recognized at all (drives the picker's "unknown => check
// everything" fallback, distinct from a known game that simply has no in-tree
// save location like Valheim).
export function isKnownGame(game: string): boolean {
  return game.toUpperCase() in DEFAULTS || game.toUpperCase() === "VALHEIM";
}
