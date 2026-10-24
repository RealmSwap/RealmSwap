/**
 * Config-editor adapter for Rust/Oxide plugin JSON configs
 * (Oxide/config/<Plugin>.json). Maps a JSON object onto the shared
 * ConfigSection model so the existing Configure modal can edit it; nested
 * structures are exposed as raw JSON text (validated on save) instead of
 * being flattened into lossy dotted keys.
 */

import fs from "fs";
import path from "path";
import { ConfigSection, ConfigProperty } from "./configParser";

export function jsonProperty(value: unknown, key: string): ConfigProperty {
  if (typeof value === "boolean") {
    return { key, value: value ? "true" : "false", type: "Boolean", defaultValue: "", description: "" };
  }
  if (typeof value === "number") {
    return { key, value: String(value), type: Number.isInteger(value) ? "Int32" : "Float", defaultValue: "", description: "" };
  }
  if (typeof value === "string") {
    return { key, value, type: "String", defaultValue: "", description: "" };
  }
  return { key, value: JSON.stringify(value, null, 2), type: "JSON", defaultValue: "", description: "" };
}

/** Parse an Oxide plugin config into one section named after the file. */
export function parseJsonConfig(filePath: string): ConfigSection[] {
  let doc: unknown;
  try {
    doc = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err: any) {
    throw new Error(`Plugin config is not valid JSON: ${err.message}`);
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("Plugin config has an unexpected JSON shape (expected an object).");
  }
  return [
    {
      name: path.basename(filePath),
      properties: Object.entries(doc as Record<string, unknown>).map(([k, v]) => jsonProperty(v, k)),
    },
  ];
}

/**
 * Apply submitted values back onto the ORIGINAL document (order, unknown
 * nesting and formatting style preserved by re-serializing the original
 * object). Keys must exist — the editor edits, it never invents schema.
 */
export function serializeJsonConfig(originalPath: string, sections: ConfigSection[]): string {
  const doc = JSON.parse(fs.readFileSync(originalPath, "utf-8")) as Record<string, unknown>;
  const submitted = sections.flatMap((s) => s.properties);
  if (submitted.length === 0) throw new Error("No values submitted.");

  for (const prop of submitted) {
    if (!(prop.key in doc)) {
      throw new Error(`Config no longer contains '${prop.key}' — reload the editor and try again.`);
    }
    const v = prop.value;
    if (/[\r\n]/.test(v.trim()) && prop.type !== "JSON") {
      throw new Error(`'${prop.key}' must stay on one line.`);
    }
    switch (prop.type) {
      case "Boolean":
        if (v !== "true" && v !== "false") throw new Error(`'${prop.key}' is true/false.`);
        doc[prop.key] = v === "true";
        break;
      case "Int32": {
        if (!/^[+-]?\d+$/.test(v.trim())) throw new Error(`'${prop.key}' must be a whole number.`);
        doc[prop.key] = parseInt(v, 10);
        break;
      }
      case "Float": {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`'${prop.key}' must be a number.`);
        doc[prop.key] = n;
        break;
      }
      case "JSON":
        try {
          doc[prop.key] = JSON.parse(v);
        } catch {
          throw new Error(`'${prop.key}' is not valid JSON.`);
        }
        break;
      default:
        doc[prop.key] = v;
    }
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}
