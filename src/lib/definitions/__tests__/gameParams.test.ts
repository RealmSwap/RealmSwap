import { describe, it, expect } from "vitest";
import { BUILTIN_DEFINITIONS } from "../builtins";
import { buildContext } from "../context";
import { planLaunch } from "../plan";
import { writeEnshroudedConfig } from "../strategies";
import fs from "fs";
import os from "os";
import path from "path";

function ctxFor(slug: string, paramValuesJson: string | null) {
  const d = BUILTIN_DEFINITIONS.find((x) => x.slug === slug)!;
  return {
    def: d,
    ctx: buildContext({ name: "Test Realm", password: "pass123", port: d.spec.defaultPort, ram: 8, paramValuesJson, spec: d.spec }),
  };
}

function launchArgs(slug: string, paramValuesJson: string | null): string[] {
  const { def, ctx } = ctxFor(slug, paramValuesJson);
  return planLaunch(def.spec, ctx).args;
}

describe("new game params keep historical defaults, accept overrides", () => {
  it("Rust: defaults render the historical argv; overrides change seed/worldsize/maxplayers", () => {
    expect(launchArgs("RUST", null)).toEqual([
      "-batchmode", "+server.port", "28015", "+server.identity", "servertest",
      "+server.seed", "12345", "+server.worldsize", "3000", "+server.maxplayers", "10",
      "+server.hostname", "Test Realm", "+rcon.port", "28016", "+rcon.password", "pass123", "+rcon.web", "1",
    ]);
    const custom = launchArgs("RUST", JSON.stringify({ maxPlayers: 200, worldSize: 4500, seed: 42 }));
    expect(custom).toContain("+server.maxplayers");
    expect(custom[custom.indexOf("+server.maxplayers") + 1]).toBe("200");
    expect(custom[custom.indexOf("+server.worldsize") + 1]).toBe("4500");
    expect(custom[custom.indexOf("+server.seed") + 1]).toBe("42");
  });

  it("ARK: default argv keeps MaxPlayers=20; override flows into both password branches", () => {
    expect(launchArgs("ARK", null).join(" ")).toContain("MaxPlayers=20");
    const custom = launchArgs("ARK", JSON.stringify({ maxPlayers: 50 }));
    expect(custom.join(" ")).toContain("MaxPlayers=50");
  });

  it("Palworld: default argv keeps players=16; override changes it", () => {
    expect(launchArgs("PALWORLD", null).join(" ")).toContain("?players=16");
    expect(launchArgs("PALWORLD", JSON.stringify({ maxPlayers: 32 })).join(" ")).toContain("?players=32");
  });

  it("Enshrouded: slotCount param reaches the config writer", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enshrouded-"));
    try {
      const { ctx } = ctxFor("ENSHROUDED", JSON.stringify({ slotCount: 8 }));
      writeEnshroudedConfig(dir, "Test Realm", "pass123", typeof ctx.slotCount === "number" ? ctx.slotCount : 16);
      const config = JSON.parse(fs.readFileSync(path.join(dir, "enshrouded_server.json"), "utf-8"));
      expect(config.slotCount).toBe(8);

      // default stays 16
      const { ctx: defCtx } = ctxFor("ENSHROUDED", null);
      expect(defCtx.slotCount).toBe(16);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("every game with params renders its launch plan without throwing", () => {
    for (const d of BUILTIN_DEFINITIONS) {
      const ctx = buildContext({ name: "N", password: "p", port: d.spec.defaultPort, ram: 8, paramValuesJson: null, spec: d.spec });
      expect(() => planLaunch(d.spec, ctx)).not.toThrow();
    }
  });
});
