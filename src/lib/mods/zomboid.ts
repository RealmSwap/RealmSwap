import fs from "fs";
import path from "path";

/**
 * servertest.ini list-key editing for Project Zomboid workshop mods.
 *
 * The server config lists mods on two `;`-separated keys with DIFFERENT id
 * spaces: `WorkshopItems=` holds Steam Workshop file IDs (what gets
 * downloaded), `Mods=` holds the mods' internal IDs (what gets enabled).
 * A workshop item and its mod ID are unrelated strings, so every add/remove
 * needs both values — matching by segment, never by substring (workshop IDs
 * are long digit strings and substring matching merges distinct ids).
 */
export function zomboidServerIniPath(serverRoot: string): string {
  return path.join(serverRoot, "zomboid-server", "zomboid-data", "Server", "servertest.ini");
}

function readList(content: string, key: string): string[] {
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(content);
  if (!match) return [];
  return match[1].split(";").map((s) => s.trim()).filter((s) => s !== "");
}

function upsertList(content: string, key: string, values: string[]): string {
  const line = `${key}=${values.join(";")}`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) return content.replace(regex, line);
  return content.endsWith("\n") || content === "" ? `${content}${line}\n` : `${content}\n${line}\n`;
}

function editIni(iniPath: string, edit: (content: string) => string): void {
  let content = "";
  if (fs.existsSync(iniPath)) content = fs.readFileSync(iniPath, "utf-8");
  fs.mkdirSync(path.dirname(iniPath), { recursive: true });
  fs.writeFileSync(iniPath, edit(content));
}

/**
 * Read both list keys: the workshop file IDs and the enabled mod IDs. The two
 * lists cannot be re-paired from the ini alone (they are parallel, not
 * interleaved), so callers get them as independent sets.
 */
export function readZomboidModLists(iniPath: string): { workshopIds: string[]; modIds: string[] } {
  if (!fs.existsSync(iniPath)) return { workshopIds: [], modIds: [] };
  const content = fs.readFileSync(iniPath, "utf-8");
  return {
    workshopIds: readList(content, "WorkshopItems"),
    modIds: readList(content, "Mods"),
  };
}

/** Content-based add (shared by the fs writer and the node flow, which
 *  reads/writes the ini over the agent file commands). */
export function addZomboidWorkshopModContent(content: string, workshopId: string, modIds: string[]): string {
  if (!readList(content, "WorkshopItems").includes(workshopId)) {
    content = upsertList(content, "WorkshopItems", [...readList(content, "WorkshopItems"), workshopId]);
  }
  const mods = readList(content, "Mods");
  const missing = modIds.filter((id) => !mods.includes(id));
  if (missing.length > 0) {
    content = upsertList(content, "Mods", [...mods, ...missing]);
  }
  return content;
}

/** Content-based remove. */
export function removeZomboidWorkshopModContent(content: string, workshopId: string, modIds: string[]): string {
  const workshopItems = readList(content, "WorkshopItems").filter((x) => x !== workshopId);
  content = upsertList(content, "WorkshopItems", workshopItems);
  if (modIds.length > 0) {
    const remove = new Set(modIds);
    const mods = readList(content, "Mods").filter((x) => !remove.has(x));
    content = upsertList(content, "Mods", mods);
  }
  return content;
}

/**
 * Content-based disable: strip ONLY the Mods= entries. WorkshopItems= keeps
 * the item, so the SteamCMD download stays and enable re-appends the ids.
 */
export function disableZomboidWorkshopModContent(content: string, modIds: string[]): string {
  if (modIds.length === 0) return content;
  const remove = new Set(modIds);
  return upsertList(content, "Mods", readList(content, "Mods").filter((x) => !remove.has(x)));
}

/**
 * Register a workshop mod on both keys. Idempotent per id; safe on a missing
 * ini. One workshop item can ship several mod folders — pass every mod ID.
 */
export function addZomboidWorkshopMod(iniPath: string, workshopId: string, modId: string | string[]): void {
  const modIds = Array.isArray(modId) ? modId : [modId];
  editIni(iniPath, (content) => addZomboidWorkshopModContent(content, workshopId, modIds));
}

/**
 * Remove a workshop mod: its Workshop ID from `WorkshopItems=` and its mod ID
 * (or every mod ID a multi-mod item carried) from `Mods=`. Other entries and
 * unrelated ini lines are preserved. The ini is left untouched when it
 * doesn't exist (nothing was ever installed).
 */
export function removeZomboidWorkshopMod(iniPath: string, workshopId: string, modId: string | string[] | null): void {
  if (!fs.existsSync(iniPath)) return;
  const modIds = modId === null ? [] : Array.isArray(modId) ? modId : [modId];
  editIni(iniPath, (content) => removeZomboidWorkshopModContent(content, workshopId, modIds));
}
