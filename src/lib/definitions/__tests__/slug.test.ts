import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "../slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("My Cool Game")).toBe("my-cool-game");
  });

  it("strips non-alphanumeric characters (except hyphens)", () => {
    expect(slugify("ARK: Survival Evolved!")).toBe("ark-survival-evolved");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("test--game")).toBe("test-game");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --game--  ")).toBe("game");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles all-special characters", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("preserves existing lowercase slug", () => {
    expect(slugify("minecraft")).toBe("minecraft");
  });

  it("handles numbers", () => {
    expect(slugify("Game 2")).toBe("game-2");
  });
});

describe("uniqueSlug", () => {
  it("returns base slug when no existing slugs", () => {
    expect(uniqueSlug("My Game", [])).toBe("my-game");
  });

  it("appends -2 when base slug exists", () => {
    expect(uniqueSlug("My Game", ["my-game"])).toBe("my-game-2");
  });

  it("appends -3 when -2 also exists", () => {
    expect(uniqueSlug("My Game", ["my-game", "my-game-2"])).toBe("my-game-3");
  });

  it("uses the first available suffix", () => {
    expect(uniqueSlug("test", ["test", "test-2", "test-3"])).toBe("test-4");
  });

  it("returns base when base is not in existing list", () => {
    expect(uniqueSlug("alpha", ["beta", "gamma"])).toBe("alpha");
  });
});
