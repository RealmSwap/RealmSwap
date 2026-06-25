import fs from "fs";

export interface ConfigProperty {
  key: string;
  value: string;
  type: string;
  defaultValue: string;
  description: string;
}

export interface ConfigSection {
  name: string;
  properties: ConfigProperty[];
}

/**
 * Parses a BepInEx standard .cfg file into structured JSON.
 */
export function parseBepInExConfig(filePath: string): ConfigSection[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found at ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const sections: ConfigSection[] = [];
  let currentSection: ConfigSection | null = null;

  let currentDesc = "";
  let currentType = "String";
  let currentDefault = "";

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Section header
    if (line.startsWith("[") && line.endsWith("]")) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        name: line.substring(1, line.length - 1),
        properties: []
      };
      continue;
    }

    // BepInEx metadata comments
    if (line.startsWith("## ")) {
      currentDesc = line.substring(3).trim();
      continue;
    }
    if (line.startsWith("# Setting type: ")) {
      currentType = line.substring(16).trim();
      continue;
    }
    if (line.startsWith("# Default value: ")) {
      currentDefault = line.substring(17).trim();
      continue;
    }

    // Key-value pair
    if (!line.startsWith("#") && line.includes("=")) {
      const splitIdx = line.indexOf("=");
      const key = line.substring(0, splitIdx).trim();
      const value = line.substring(splitIdx + 1).trim();

      if (currentSection) {
        currentSection.properties.push({
          key,
          value,
          type: currentType,
          defaultValue: currentDefault,
          description: currentDesc
        });
      }

      // Reset metadata for next key
      currentDesc = "";
      currentType = "String";
      currentDefault = "";
    }
  }

  if (currentSection) sections.push(currentSection);

  return sections;
}
