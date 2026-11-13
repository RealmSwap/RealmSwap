import { describe, it, expect, vi } from "vitest";
import { BUILTIN_DEFINITIONS } from "../builtins";
import { validateSpec } from "../validate";
import { buildQueryContext, resolveQueryPort, queryGameServer } from "../../serverQuery";
import type { GameDefinitionSpec } from "../types";

const specOf = (slug: string): GameDefinitionSpec => BUILTIN_DEFINITIONS.find((d) => d.slug === slug)!.spec;
const ctxAtPort = (port: number) =>
  buildQueryContext({ name: "x", port, ramAllocation: 4, password: null, paramValues: null });

describe("builtin definitions", () => {
  it("has all 11 games", () => {
    expect(BUILTIN_DEFINITIONS.map((d) => d.slug).sort()).toEqual(
      ["ARK", "ENSHROUDED", "MINECRAFT", "PALWORLD", "RUST", "SATISFACTORY", "TERRARIA", "VALHEIM", "VRISING", "WINDROSE", "ZOMBOID"]
    );
  });
  it("every builtin spec validates", () => {
    for (const d of BUILTIN_DEFINITIONS) {
      expect(validateSpec(d.spec, d.installMethod), `${d.slug} should validate`).toEqual([]);
    }
  });
  it("Minecraft requires Java and pins an initial major version", () => {
    const mc = BUILTIN_DEFINITIONS.find((d) => d.slug === "MINECRAFT")!;
    expect(mc.spec.requiresJava).toBe(true);
    expect(mc.spec.javaMajor).toBe(25);
  });
});

/**
 * gamedig v5 mappings. Each mapped game cites its documented port convention;
 * games without a sane query protocol stay unmapped (the "unsupported" path)
 * instead of guessing ports.
 */
describe("gamedig query mappings", () => {
  it("valheim queries one port above the join port (2456 join -> 2457 Steam query)", () => {
    const s = specOf("VALHEIM");
    expect(s.queryType).toBe("valheim");
    expect(resolveQueryPort(s, ctxAtPort(2456), 2456)).toBe(2457);
  });

  it("project zomboid queries the join port itself (gamedig's default for PZ)", () => {
    const s = specOf("ZOMBOID");
    expect(s.queryType).toBe("projectzomboid");
    expect(s.queryPort).toBeUndefined();
    expect(resolveQueryPort(s, ctxAtPort(16261), 16261)).toBe(16261);
  });

  it("ark queries the pinned Steam query port 27015 (matches -QueryPort=27015 in our launch args)", () => {
    const s = specOf("ARK");
    expect(s.queryType).toBe("ase");
    expect(resolveQueryPort(s, ctxAtPort(7777), 7777)).toBe(27015);
  });

  it("rust queries the join port itself (A2S on 28015; 28016 TCP is the websocket RCON)", () => {
    const s = specOf("RUST");
    expect(s.queryType).toBe("rust");
    expect(s.queryPort).toBeUndefined();
    expect(resolveQueryPort(s, ctxAtPort(28015), 28015)).toBe(28015);
  });

  it("satisfactory queries the game port itself (HTTPS API on 7777)", () => {
    const s = specOf("SATISFACTORY");
    expect(s.queryType).toBe("satisfactory");
    expect(resolveQueryPort(s, ctxAtPort(7777), 7777)).toBe(7777);
  });

  it("v rising queries one port above the join port (9876 join -> 9877 query)", () => {
    const s = specOf("VRISING");
    expect(s.queryType).toBe("vrising");
    expect(resolveQueryPort(s, ctxAtPort(9876), 9876)).toBe(9877);
  });

  it("enshrouded queries the join port itself (15637 is both join and query address)", () => {
    const s = specOf("ENSHROUDED");
    expect(s.queryType).toBe("enshrouded");
    expect(s.queryPort).toBeUndefined();
    expect(resolveQueryPort(s, ctxAtPort(15637), 15637)).toBe(15637);
  });

  it("minecraft keeps its server-list ping mapping", () => {
    expect(specOf("MINECRAFT").queryType).toBe("minecraft");
  });

  it("games without a sane query protocol stay unsupported", () => {
    // TERRARIA: gamedig's terraria type is TShock-only (+101 port), ours is vanilla.
    // PALWORLD: gamedig type is the experimental REST API (8212 + admin credentials).
    // WINDROSE: no documented query protocol.
    for (const slug of ["TERRARIA", "PALWORLD", "WINDROSE"]) {
      expect(specOf(slug).queryType, `${slug} must stay unmapped`).toBeUndefined();
    }
  });

  it("a running valheim server queries the derived game id + port end to end", async () => {
    const dig = vi.fn().mockResolvedValue({ name: "x", players: [{ name: "A" }], maxplayers: 10 });
    const result = await queryGameServer(
      { status: "RUNNING", port: 2456, name: "x", ramAllocation: 4, password: null, paramValues: null },
      specOf("VALHEIM"),
      { dig, host: "127.0.0.1" }
    );
    expect(dig).toHaveBeenCalledWith({ type: "valheim", host: "127.0.0.1", port: 2457 });
    expect(result).toEqual({
      status: "online",
      name: "x",
      players: 1,
      maxplayers: 10,
      playerList: [{ name: "A" }],
    });
  });
});
