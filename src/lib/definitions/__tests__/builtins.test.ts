import { describe, it, expect } from "vitest";
import { BUILTIN_DEFINITIONS } from "../builtins";
import { validateSpec } from "../validate";

describe("builtin definitions", () => {
  it("has all 8 games", () => {
    expect(BUILTIN_DEFINITIONS.map((d) => d.slug).sort()).toEqual(
      ["ARK", "ENSHROUDED", "MINECRAFT", "PALWORLD", "RUST", "TERRARIA", "VALHEIM", "ZOMBOID"]
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
