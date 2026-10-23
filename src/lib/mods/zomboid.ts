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

/** Register a workshop mod on both keys. Idempotent per id; safe on a missing ini. */
export function addZomboidWorkshopMod(iniPath: string, workshopId: string, modId: string): void {
  editIni(iniPath, (content) => {
    if (!readList(content, "WorkshopItems").includes(workshopId)) {
      content = upsertList(content, "WorkshopItems", [...readList(content, "WorkshopItems"), workshopId]);
    }
    if (!readList(content, "Mods").includes(modId)) {
      content = upsertList(content, "Mods", [...readList(content, "Mods"), modId]);
    }
    return content;
  });
}

/**
 * Remove a workshop mod: its Workshop ID from `WorkshopItems=` and its mod ID
 * from `Mods=`. Other entries and unrelated ini lines are preserved. The ini
 * is left untouched when it doesn't exist (nothing was ever installed).
 */
export function removeZomboidWorkshopMod(iniPath: string, workshopId: string, modId: string | null): void {
  if (!fs.existsSync(iniPath)) return;
  editIni(iniPath, (content) => {
    const workshopItems = readList(content, "WorkshopItems").filter((x) => x !== workshopId);
    content = upsertList(content, "WorkshopItems", workshopItems);
    if (modId) {
      const mods = readList(content, "Mods").filter((x) => x !== modId);
      content = upsertList(content, "Mods", mods);
    }
    return content;
  });
}
