import fs from "fs";
import path from "path";

/**
 * Friend-side Steam discovery for the sync flow: find a game's install
 * directory and build its `steam://run` launch command.
 *
 * Resolution order per game:
 *   1. steamapps/appmanifest_<appId>.acf in every known Steam library
 *      (authoritative — installdir comes from Valve's own manifest)
 *   2. legacy folder-name guessing under each library's steamapps/common
 */

/**
 * Client (game, not dedicated-server) Steam appIds, keyed by game key.
 * Accepts both the catalog slug ("VRISING", "ZOMBOID", "ARK") and the display
 * name ("V Rising", "Project Zomboid", "ARK: Survival Evolved") — lookup
 * normalizes punctuation, so both forms collapse onto the same entry.
 *
 * Minecraft is not a Steam app and Windrose has no known client appId —
 * both intentionally absent; callers fall back to legacy behavior.
 */
const STEAM_APP_IDS: Record<string, string> = {
  VALHEIM: "892970",
  PALWORLD: "1623730",
  VRISING: "1604030",
  ZOMBOID: "108600",
  PROJECTZOMBOID: "108600",
  ARK: "346110",
  ARKSURVIVALEVOLVED: "346110",
  RUST: "252490",
  TERRARIA: "105600",
  SATISFACTORY: "526870",
  ENSHROUDED: "1203620",
  LETHALCOMPANY: "1966720",
};

/** Normalize a game key/display name so slug and display forms collide. */
function normalizeGameKey(game: string): string {
  return (game || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The client's Steam appId for a game, or null when unmapped. */
export function steamAppIdForGame(game: string): string | null {
  return STEAM_APP_IDS[normalizeGameKey(game)] ?? null;
}

/** Build the shell command Steam runs for a mapped game; null if unmapped. */
export function steamLaunchCommand(game: string): string | null {
  const appId = steamAppIdForGame(game);
  return appId ? `start steam://run/${appId}` : null;
}

// ---------------------------------------------------------------------------
// Valve KeyValue ("VDF") parsing — just enough for libraryfolders.vdf and
// appmanifest_*.acf. No dependency: both files use the same tiny quoted-
// string + brace format.
// ---------------------------------------------------------------------------

export type VdfValue = string | VdfNode;
export interface VdfNode {
  [key: string]: VdfValue;
}

function tokenizeVdf(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  // Strip a BOM if present.
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === '"') {
      i++;
      let buf = "";
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\" && i + 1 < text.length) {
          i++;
          buf += text[i]; // keep escapes raw (\\ stays \\); unescaped later
        } else {
          buf += text[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push(buf);
      continue;
    }
    if (ch === "{" || ch === "}") {
      tokens.push(ch);
      i++;
      continue;
    }
    // Bare token (unquoted key/value)
    let buf = "";
    while (i < text.length && !/\s/.test(text[i]) && text[i] !== "{" && text[i] !== "}") {
      buf += text[i];
      i++;
    }
    if (buf) tokens.push(buf);
  }
  return tokens;
}

/** Parse a Valve KeyValue document into a nested node tree (last key wins). */
export function parseVdf(text: string): VdfNode {
  const tokens = tokenizeVdf(text);
  let pos = 0;

  function parseBlock(): VdfNode {
    const node: VdfNode = {};
    while (pos < tokens.length) {
      const tok = tokens[pos++];
      if (tok === "}") return node;
      if (tok === "{") continue; // stray brace, skip
      const next = tokens[pos];
      if (next === "{") {
        pos++;
        node[tok] = parseBlock();
      } else if (next !== undefined && next !== "}") {
        node[tok] = next;
        pos++;
      } else {
        node[tok] = ""; // key with no value on its line
      }
    }
    return node;
  }

  return parseBlock();
}

function unescapeVdfString(value: string): string {
  return value.replace(/\\\\/g, "\\").replace(/\\"/g, '"');
}

function looksLikeDrivePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

/**
 * Extract Steam library paths from a libraryfolders.vdf document. Handles both
 * the modern format (`"0" { "path" "C:\\..." }`) and the legacy flat format
 * (`"1"  "D:\\SteamLibrary"`).
 */
export function libraryPathsFromVdf(text: string): string[] {
  const root = parseVdf(text);
  const found: string[] = [];

  const visit = (node: VdfNode) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") {
        const isPathValue =
          looksLikeDrivePath(value) &&
          (key === "path" || /^\d+$/.test(key));
        if (isPathValue) {
          found.push(unescapeVdfString(value));
        }
      } else {
        visit(value);
      }
    }
  };
  visit(root);

  // Dedupe, normalizing separators so "C:\Games\Steam" and "C:/Games/Steam"
  // collapse to one library.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of found) {
    const normalized = p.replace(/[\\/]+$/, "").toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(p);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Library + install-dir resolution
// ---------------------------------------------------------------------------

/**
 * Known Steam roots used as seeds. The static roots are assembled from parts
 * (not a single path.join literal) because bundlers statically resolve literal
 * path.join(...) strings as filesystem asset references — which fails
 * `next build` on any machine that doesn't have that exact Steam folder.
 * %ProgramFiles(x86)% is read dynamically because it moves on localized
 * Windows installs.
 */
const STATIC_STEAM_ROOT_PARTS: string[][] = [
  ["C:", "Program Files (x86)", "Steam"],
  ["D:", "SteamLibrary"],
];

export function steamRootCandidates(
  env: Record<string, string | undefined> = process.env
): string[] {
  const roots: string[] = [];
  const pf86 = env["ProgramFiles(x86)"];
  if (pf86) {
    roots.push(path.join(pf86, "Steam"));
  }
  for (const parts of STATIC_STEAM_ROOT_PARTS) {
    roots.push(parts.join(path.sep));
  }
  // Dedupe (the env value usually IS C:\Program Files (x86)).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of roots) {
    const key = r.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

/** Read "installdir" out of an appmanifest_*.acf; null if unreadable/absent. */
export function readInstallDirFromManifest(manifestPath: string): string | null {
  let text: string;
  try {
    text = fs.readFileSync(manifestPath, "utf8");
  } catch {
    return null;
  }
  let found: string | null = null;
  const visit = (node: VdfNode) => {
    for (const [key, value] of Object.entries(node)) {
      if (found) return;
      if (typeof value === "string") {
        if (key.toLowerCase() === "installdir" && value) {
          found = unescapeVdfString(value);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(parseVdf(text));
  return found;
}

/** Last-resort install folder names for games without an appmanifest. */
const FOLDER_NAME_GUESSES: Record<string, string> = {
  VALHEIM: "Valheim",
  LETHALCOMPANY: "Lethal Company",
};

function folderNameGuesses(game: string): string[] {
  const normalized = normalizeGameKey(game);
  const guesses = [FOLDER_NAME_GUESSES[normalized], game].filter(
    (g): g is string => Boolean(g)
  );
  // Dedupe while preserving order.
  return Array.from(new Set(guesses));
}

export interface FindSteamGameOptions {
  /** Override the seed Steam roots (tests, portable installs). */
  roots?: string[];
}

/**
 * Locate a game's install directory:
 *   1. every seed root, plus every library listed in its libraryfolders.vdf,
 *      checked for steamapps/appmanifest_<appId>.acf → installdir
 *   2. folder-name guessing under <library>/steamapps/common
 * Returns null when nothing checks out.
 */
export function findSteamGameDir(game: string, opts: FindSteamGameOptions = {}): string | null {
  const seedRoots = opts.roots ?? steamRootCandidates();

  // Seed roots are themselves libraries; libraryfolders.vdf under each adds
  // the rest of the machine's libraries.
  const libraries: string[] = [];
  const seen = new Set<string>();
  const addLibrary = (lib: string) => {
    const key = lib.replace(/[\\/]+$/, "").toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      libraries.push(lib);
    }
  };
  for (const root of seedRoots) {
    addLibrary(root);
    const vdfPath = path.join(root, "steamapps", "libraryfolders.vdf");
    if (fs.existsSync(vdfPath)) {
      try {
        for (const lib of libraryPathsFromVdf(fs.readFileSync(vdfPath, "utf8"))) {
          addLibrary(lib);
        }
      } catch {
        // Unreadable vdf: the seed roots are still usable.
      }
    }
  }

  // 1. Authoritative: appmanifest_<appId>.acf → installdir
  const appId = steamAppIdForGame(game);
  if (appId) {
    for (const lib of libraries) {
      const manifestPath = path.join(lib, "steamapps", `appmanifest_${appId}.acf`);
      const installdir = readInstallDirFromManifest(manifestPath);
      if (!installdir) continue;
      const dir = path.join(lib, "steamapps", "common", installdir);
      if (fs.existsSync(dir)) return dir;
    }
  }

  // 2. Last resort: folder-name guessing under steamapps/common
  for (const lib of libraries) {
    const commonDir = path.join(lib, "steamapps", "common");
    for (const guess of folderNameGuesses(game)) {
      const candidate = path.join(commonDir, guess);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}
