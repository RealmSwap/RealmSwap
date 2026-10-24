/**
 * Line-preserving editor for Minecraft Forge/NeoForge TOML configs.
 *
 * Unlike a full TOML parser, this keeps the file byte-stable except for the
 * values the user changed: comments, blank lines, unknown keys and ordering
 * all survive a save. Forge configs are the `[section]` + `key = value`
 * shape humans edit; multi-line constructs (which valid TOML allows but
 * Forge's config writer never emits) are refused honestly instead of being
 * silently mangled.
 */

import fs from "fs";
import { ConfigSection, ConfigProperty } from "./configParser";

export function detectTomlType(value: string): string {
  const v = value.trim();
  if (v === "true" || v === "false") return "Boolean";
  if (/^[+-]?\d+$/.test(v)) return "Int32";
  if (/^[+-]?(\d+\.\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) return "Float";
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return "String";
  if (v.startsWith("[") && v.endsWith("]")) return "List";
  return "Toml";
}

function parseTomlLiteral(value: string): ConfigProperty {
  return {
    key: "",
    value,
    type: detectTomlType(value),
    defaultValue: "",
    description: "",
  };
}

/** Parse a Forge-style TOML config into the shared ConfigSection model. */
export function parseTomlConfig(filePath: string): ConfigSection[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const sections: ConfigSection[] = [];
  let current: ConfigSection | null = null;
  let description = "";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      description = "";
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
      current = { name: line.slice(1, -1).trim(), properties: [] };
      sections.push(current);
      description = "";
      continue;
    }
    if (line.startsWith("#")) {
      description = description ? `${description}\n${line.replace(/^#\s?/, "")}` : line.replace(/^#\s?/, "");
      continue;
    }
    const eq = line.indexOf("=");
    if (eq > 0 && current) {
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (/[,[]/.test(key) || !key) {
        description = "";
        continue;
      }
      current.properties.push({
        key,
        value,
        type: detectTomlType(value),
        defaultValue: "",
        description,
      });
    }
    description = "";
  }
  return sections;
}

/**
 * Validate + render the TOML literal a submitted value must become, based on
 * the ORIGINAL value's type — keeps the file parseable (a bare `hello` is
 * not valid TOML; a string must stay quoted).
 */
export function tomlLiteralFor(original: ConfigProperty, newValue: string): string {
  const v = newValue.trim();
  if (/[\r\n]/.test(v)) throw new Error(`'${original.key}' must stay on one line.`);
  if (v.length > 2000) throw new Error(`'${original.key}' value is too long.`);
  switch (original.type) {
    case "Boolean":
      if (v !== "true" && v !== "false") throw new Error(`'${original.key}' is true/false.`);
      return v;
    case "Int32":
      if (!/^[+-]?\d+$/.test(v)) throw new Error(`'${original.key}' must be a whole number.`);
      return v;
    case "Float":
      if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(v)) throw new Error(`'${original.key}' must be a number.`);
      return v;
    case "String":
      if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v;
      return JSON.stringify(v);
    case "List":
      if (!(v.startsWith("[") && v.endsWith("]"))) throw new Error(`'${original.key}' must be a [list].`);
      return v;
    default:
      if (!v) throw new Error(`'${original.key}' cannot be empty.`);
      return v;
  }
}

/**
 * Rewrite the config with the submitted values, touching only the `key =`
 * lines the model matched. Submitting a (section, key) that doesn't exist in
 * the file is an error — this editor edits, it never invents schema.
 */
export function serializeTomlConfig(originalPath: string, sections: ConfigSection[]): string {
  const wanted = new Map<string, ConfigProperty>();
  for (const section of sections) {
    for (const prop of section.properties) {
      wanted.set(`${section.name}\u0000${prop.key}`, prop);
    }
  }
  const used = new Set<string>();

  const lines = fs.readFileSync(originalPath, "utf-8").split(/\r?\n/);
  let currentSection = "";
  const out = lines.map((rawLine) => {
    const line = rawLine.trim();
    if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
      currentSection = line.slice(1, -1).trim();
      return rawLine;
    }
    const eq = line.indexOf("=");
    if (eq <= 0 || line.startsWith("#")) return rawLine;
    const key = line.slice(0, eq).trim();
    if (!key || /[,[]/.test(key)) return rawLine;
    const prop = wanted.get(`${currentSection}\u0000${key}`);
    if (!prop) return rawLine;
    const rendered = tomlLiteralFor({ ...prop, value: line.slice(eq + 1).trim() }, prop.value);
    used.add(`${currentSection}\u0000${key}`);
    return `${key} = ${rendered}`;
  });

  const missing = Array.from(wanted.keys()).filter((k) => !used.has(k));
  if (missing.length > 0) {
    throw new Error(
      `Config no longer contains '${missing[0].split("\u0000")[1]}' — reload the editor and try again.`
    );
  }
  return out.join("\n");
}
