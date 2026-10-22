import { describe, it, expect } from "vitest";
import { assembleSettingsFields, effectiveParamValues } from "../settings";
import { BUILTIN_DEFINITIONS } from "../builtins";
import { buildContext } from "../context";
import { planConfigFiles, planLaunch } from "../plan";
import type { ParamSpec } from "../types";

const params: ParamSpec[] = [
  { key: "motd", label: "MOTD", type: "text", default: "Hello", group: "Presentation" },
  { key: "maxPlayers", label: "Max players", type: "number", default: 10, min: 1, max: 100, group: "Gameplay" },
  { key: "pvp", label: "PvP", type: "boolean", default: true, group: "Gameplay", help: "Allow player combat" },
];

describe("effectiveParamValues", () => {
  it("layers stored values over declared defaults", () => {
    expect(effectiveParamValues(params, { maxPlayers: 40 })).toEqual({
      motd: "Hello",
      maxPlayers: 40,
      pvp: true,
    });
  });

  it("falls back to defaults for keys a server predates (empty stored values)", () => {
    expect(effectiveParamValues(params, { motd: "", pvp: undefined as unknown as boolean })).toEqual({
      motd: "Hello",
      maxPlayers: 10,
      pvp: true,
    });
  });
});

describe("assembleSettingsFields", () => {
  it("returns spec + effective value and carries metadata", () => {
    const fields = assembleSettingsFields(params, { pvp: false });
    expect(fields).toHaveLength(3);
    expect(fields[1]).toMatchObject({ key: "maxPlayers", value: 10, group: "Gameplay" });
    expect(fields[2]).toMatchObject({ key: "pvp", value: false, help: "Allow player combat" });
  });
});

describe("builtin game settings wiring", () => {
  const mc = BUILTIN_DEFINITIONS.find((d) => d.slug === "MINECRAFT")!;
  const vh = BUILTIN_DEFINITIONS.find((d) => d.slug === "VALHEIM")!;

  function mcProperties(paramValuesJson: string | null) {
    const ctx = buildContext({ name: "Test", password: null, port: 25565, ram: 4, paramValuesJson, spec: mc.spec });
    const files = planConfigFiles(mc.spec, ctx);
    return files.find((f) => f.relPath === "server.properties")!.content!;
  }

  it("Minecraft declares params and renders them into server.properties", () => {
    expect(mc.spec.params.length).toBeGreaterThan(0);
    const content = mcProperties(null);
    expect(content).toContain("online-mode=false");
    expect(content).toContain("max-players=10");
    expect(content).toContain("difficulty=normal");
    expect(content).toContain("pvp=true");
    expect(content).toContain("view-distance=10");
  });

  it("stored Minecraft param overrides render into the template", () => {
    const content = mcProperties(JSON.stringify({ maxPlayers: 32, motd: "Custom MOTD", pvp: false }));
    expect(content).toContain("max-players=32");
    expect(content).toContain("motd=Custom MOTD");
    expect(content).toContain("pvp=false");
  });

  it("Valheim worldName defaults keep the historical argv, overrides change it", () => {
    const base = buildContext({ name: "Viking", password: "pass1", port: 2456, ram: 6, paramValuesJson: null, spec: vh.spec });
    expect(planLaunch(vh.spec, base).args).toContain("Dedicated");

    const custom = buildContext({ name: "Viking", password: "pass1", port: 2456, ram: 6, paramValuesJson: JSON.stringify({ worldName: "MyWorld" }), spec: vh.spec });
    const args = planLaunch(vh.spec, custom).args;
    const worldIdx = args.indexOf("-world");
    expect(args[worldIdx + 1]).toBe("MyWorld");
  });

  it("every builtin param template variable is declared (parity with validateSpec's known set)", () => {
    for (const d of BUILTIN_DEFINITIONS) {
      const ctx = buildContext({ name: "N", password: "p", port: d.spec.defaultPort, ram: 4, paramValuesJson: null, spec: d.spec });
      // Rendering must not throw for any builtin with default params.
      expect(() => planConfigFiles(d.spec, ctx)).not.toThrow();
    }
  });
});
