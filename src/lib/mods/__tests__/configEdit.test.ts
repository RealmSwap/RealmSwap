import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Line-preserving TOML editing (Minecraft Forge/NeoForge configs) and the
 * Oxide plugin JSON adapter. Real files in a temp dir.
 */

import { parseTomlConfig, serializeTomlConfig, detectTomlType } from "@/lib/mods/tomlConfig";
import { parseJsonConfig, serializeJsonConfig } from "@/lib/mods/jsonConfig";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "config-edit-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const FORGE_TOML = `# Configuration file

[general]
# Should the mod log to chat?
logToChat = true
# How many times per second to tick.
tickRate = 20
# Display name.
name = "My Server"
# Multiplier.
rate = 1.5
# Allowed players.
allowed = ["alice", "bob"]

[advanced."sub section"]
depth = 2
`;

describe("tomlConfig", () => {
  it("detects literal types", () => {
    expect(detectTomlType("true")).toBe("Boolean");
    expect(detectTomlType("-3")).toBe("Int32");
    expect(detectTomlType("1.5")).toBe("Float");
    expect(detectTomlType('"hi"')).toBe("String");
    expect(detectTomlType("[1, 2]")).toBe("List");
  });

  it("parses sections, values, types and comment descriptions", () => {
    const file = path.join(dir, "mymod.toml");
    fs.writeFileSync(file, FORGE_TOML);
    const sections = parseTomlConfig(file);
    expect(sections.map((s) => s.name)).toEqual(["general", 'advanced."sub section"']);
    const general = sections[0].properties;
    expect(general.map((p) => p.key)).toEqual(["logToChat", "tickRate", "name", "rate", "allowed"]);
    expect(general.map((p) => p.type)).toEqual(["Boolean", "Int32", "String", "Float", "List"]);
    expect(general[0].description).toBe("Should the mod log to chat?");
    expect(general[0].value).toBe("true");
    expect(general[2].value).toBe('"My Server"');
  });

  it("rewrites only changed values and preserves comments, ordering and unknown lines", () => {
    const file = path.join(dir, "mymod.toml");
    fs.writeFileSync(file, FORGE_TOML);
    const sections = parseTomlConfig(file);
    sections[0].properties[0].value = "false";
    sections[0].properties[2].value = "Renamed \"Server\""; // quotes added by serializer

    fs.writeFileSync(file, serializeTomlConfig(file, sections));
    const out = fs.readFileSync(file, "utf-8");

    expect(out).toContain("# Configuration file");
    expect(out).toContain("# Should the mod log to chat?\nlogToChat = false");
    expect(out).toContain('name = "Renamed \\"Server\\""');
    expect(out).toContain("tickRate = 20");
    expect(out).toContain("rate = 1.5");
    expect(out).toContain('allowed = ["alice", "bob"]');
    expect(out).toContain('[advanced."sub section"]');
    // File is still parseable, values round-trip.
    const reparsed = parseTomlConfig(file);
    expect(reparsed[0].properties[0].value).toBe("false");
    expect(reparsed[0].properties[2].type).toBe("String");
  });

  it("refuses values that would break the file", () => {
    const file = path.join(dir, "mymod.toml");
    fs.writeFileSync(file, FORGE_TOML);
    const sections = parseTomlConfig(file);
    const [general] = sections;
    expect(() => {
      const bad = structuredClone(general);
      bad.properties[0].value = "yes";
      serializeTomlConfig(file, [bad]);
    }).toThrow(/true\/false/);
    expect(() => {
      const bad = structuredClone(general);
      bad.properties[1].value = "20.5";
      serializeTomlConfig(file, [bad]);
    }).toThrow(/whole number/);
    expect(() => {
      const bad = structuredClone(general);
      bad.properties[0].value = "true\nextra=1";
      serializeTomlConfig(file, [bad]);
    }).toThrow(/one line/);
  });

  it("refuses submitted keys that no longer exist (no schema invention)", () => {
    const file = path.join(dir, "mymod.toml");
    fs.writeFileSync(file, FORGE_TOML);
    expect(() =>
      serializeTomlConfig(file, [
        { name: "general", properties: [{ key: "ghostKey", value: "1", type: "Int32", defaultValue: "", description: "" }] },
      ])
    ).toThrow(/no longer contains/);
  });
});

describe("jsonConfig (Oxide plugin configs)", () => {
  const JSON_CFG = JSON.stringify({ Enabled: true, MaxPlayers: 50, Name: "kits", Options: { a: 1 }, Tags: ["x"] });

  it("maps top-level keys to typed properties, nesting as JSON", () => {
    const file = path.join(dir, "Kits.json");
    fs.writeFileSync(file, JSON_CFG);
    const [section] = parseJsonConfig(file);
    expect(section.name).toBe("Kits.json");
    const byKey = Object.fromEntries(section.properties.map((p) => [p.key, p]));
    expect(byKey.Enabled.type).toBe("Boolean");
    expect(byKey.MaxPlayers.type).toBe("Int32");
    expect(byKey.Name.type).toBe("String");
    expect(byKey.Options.type).toBe("JSON");
    expect(JSON.parse(byKey.Options.value)).toEqual({ a: 1 });
  });

  it("applies edits preserving key order and validates JSON blobs", () => {
    const file = path.join(dir, "Kits.json");
    fs.writeFileSync(file, JSON_CFG);
    const [section] = parseJsonConfig(file);
    for (const p of section.properties) {
      if (p.key === "Enabled") p.value = "false";
      if (p.key === "Options") p.value = '{"a": 2, "b": [3]}';
    }
    fs.writeFileSync(file, serializeJsonConfig(file, [section]));

    const doc = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(Object.keys(doc)).toEqual(["Enabled", "MaxPlayers", "Name", "Options", "Tags"]);
    expect(doc).toEqual({ Enabled: false, MaxPlayers: 50, Name: "kits", Options: { a: 2, b: [3] }, Tags: ["x"] });
  });

  it("refuses invalid JSON blobs and unknown keys", () => {
    const file = path.join(dir, "Kits.json");
    fs.writeFileSync(file, JSON_CFG);
    const [section] = parseJsonConfig(file);
    const options = section.properties.find((p) => p.key === "Options")!;
    expect(() => {
      options.value = "{not json";
      serializeJsonConfig(file, [section]);
    }).toThrow(/not valid JSON/);
    expect(() =>
      serializeJsonConfig(file, [
        { name: "Kits.json", properties: [{ key: "ghost", value: "1", type: "Int32", defaultValue: "", description: "" }] },
      ])
    ).toThrow(/no longer contains/);
  });
});
