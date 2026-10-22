import { describe, it, expect } from "vitest";
import { GAME_ICONS, gameIcon, statusLabel } from "../gameDisplay";
import { BUILTIN_DEFINITIONS } from "../definitions/builtins";

describe("gameDisplay registry", () => {
  it("covers every builtin game — no view can miss one", () => {
    for (const def of BUILTIN_DEFINITIONS) {
      expect(GAME_ICONS[def.slug], `missing icon for ${def.slug}`).toBeDefined();
    }
  });

  it("falls back to a generic icon for unknown games", () => {
    expect(gameIcon("SOME_FUTURE_GAME")).toBe("🎮");
    expect(gameIcon("minecraft")).toBe(GAME_ICONS["MINECRAFT"]); // case-insensitive
  });

  it("translates statuses for humans", () => {
    expect(statusLabel("RUNNING")).toBe("Online");
    expect(statusLabel("STOPPED")).toBe("Offline");
    expect(statusLabel("STARTING")).toBe("Starting…");
    expect(statusLabel("CRASHED")).toBe("Crashed");
    expect(statusLabel("SOMETHING_ELSE")).toBe("SOMETHING_ELSE"); // pass-through
  });
});
