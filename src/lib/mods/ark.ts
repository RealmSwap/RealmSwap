import fs from "fs";
import path from "path";

/**
 * GameUserSettings.ini editing for ARK: Survival Evolved workshop mods.
 *
 * ARK's mod list lives on the comma-separated `ActiveMods=` key in the
 * `[ServerSettings]` section (order = load order). With `-automanagemods`
 * on the launch line the dedicated server downloads and updates every listed
 * Workshop ID itself at startup — unlike Zomboid there is a single id space
 * (the Workshop file id), so no second key is involved.
 *
 * The file is sectioned (unlike Zomboid's flat servertest.ini), so edits are
 * scoped to [ServerSettings] rather than matched by a bare key regex.
 */
export function arkGameUserSettingsIniPath(serverRoot: string): string {
  return path.join(
    serverRoot, "ark-server", "ShooterGame", "Saved", "Config", "WindowsServer", "GameUserSettings.ini"
  );
}

function splitSections(content: string): { header: string | null; lines: string[] }[] {
  const sections: { header: string | null; lines: string[] }[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*\[.+\]\s*$/.test(line)) {
      sections.push({ header: line.trim(), lines: [] });
    } else if (sections.length > 0) {
      sections[sections.length - 1].lines.push(line);
    } else {
      sections.push({ header: null, lines: [line] });
    }
  }
  return sections;
}

function findServerSettings(content: string): { sections: ReturnType<typeof splitSections>; index: number } | null {
  const sections = splitSections(content);
  const index = sections.findIndex((s) => s.header?.toLowerCase() === "[serversettings]");
  return index === -1 ? null : { sections, index };
}

function readActiveMods(section: { lines: string[] }): string[] {
  const match = section.lines.find((l) => /^ActiveMods=/i.test(l));
  if (!match) return [];
  return match.slice("ActiveMods=".length).split(",").map((s) => s.trim()).filter(Boolean);
}

/** The current ActiveMods list, or empty when the ini/section/key is absent. */
export function readArkActiveMods(iniPath: string): string[] {
  if (!fs.existsSync(iniPath)) return [];
  const found = findServerSettings(fs.readFileSync(iniPath, "utf-8"));
  if (!found) return [];
  return readActiveMods(found.sections[found.index]);
}

/** Register a workshop mod on ActiveMods= (append = last to load). Idempotent. */
export function addArkActiveMod(iniPath: string, workshopId: string): void {
  let content = "";
  if (fs.existsSync(iniPath)) content = fs.readFileSync(iniPath, "utf-8");
  const found = findServerSettings(content);
  if (!found) {
    // A missing [ServerSettings] section is normal on a fresh install — create it.
    const header = content && !content.endsWith("\n") ? `${content}\n` : content;
    content = `${header}[ServerSettings]\nActiveMods=${workshopId}\n`;
  } else {
    const section = found.sections[found.index];
    const mods = readActiveMods(section);
    if (!mods.includes(workshopId)) {
      const line = `ActiveMods=${[...mods, workshopId].join(",")}`;
      const lineIndex = section.lines.findIndex((l) => /^ActiveMods=/i.test(l));
      if (lineIndex >= 0) section.lines[lineIndex] = line;
      else section.lines.push(line);
      content = found.sections
        .map((s) => [s.header, ...s.lines].filter((l) => l !== undefined).join("\n"))
        .join("\n");
    }
  }
  fs.mkdirSync(path.dirname(iniPath), { recursive: true });
  fs.writeFileSync(iniPath, content);
}

/**
 * Remove a workshop mod from ActiveMods=. Other entries and unrelated ini
 * lines are preserved; a missing ini/section is left untouched (nothing was
 * ever installed).
 */
export function removeArkActiveMod(iniPath: string, workshopId: string): void {
  if (!fs.existsSync(iniPath)) return;
  const found = findServerSettings(fs.readFileSync(iniPath, "utf-8"));
  if (!found) return;
  const section = found.sections[found.index];
  const mods = readActiveMods(section);
  if (!mods.includes(workshopId)) return;
  const line = `ActiveMods=${mods.filter((m) => m !== workshopId).join(",")}`;
  const lineIndex = section.lines.findIndex((l) => /^ActiveMods=/i.test(l));
  section.lines[lineIndex] = line;
  fs.writeFileSync(
    iniPath,
    found.sections.map((s) => [s.header, ...s.lines].filter((l) => l !== undefined).join("\n")).join("\n")
  );
}
