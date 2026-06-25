import { ConfigSection } from "./configParser";

/**
 * Serializes a structured JSON config back into the BepInEx .cfg format.
 */
export function serializeBepInExConfig(sections: ConfigSection[]): string {
  let output = "";

  for (const section of sections) {
    output += `[${section.name}]\n\n`;

    for (const prop of section.properties) {
      if (prop.description) {
        // Multi-line descriptions usually have `## ` on every line
        const descLines = prop.description.split("\n");
        for (const line of descLines) {
          output += `## ${line}\n`;
        }
      }
      
      if (prop.type) {
        output += `# Setting type: ${prop.type}\n`;
      }
      
      if (prop.defaultValue !== undefined && prop.defaultValue !== "") {
        output += `# Default value: ${prop.defaultValue}\n`;
      }

      output += `${prop.key} = ${prop.value}\n\n`;
    }
  }

  return output.trim() + "\n";
}
