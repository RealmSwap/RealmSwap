import { describe, it, expect } from "vitest";
import { worldSaveDefaults, isKnownGame } from "../worldSaveDefaults";

describe("worldSaveDefaults", () => {
  it("maps Palworld to its SaveGames dir", () => {
    expect(worldSaveDefaults("PALWORLD")).toEqual(["palworld-server/Pal/Saved/SaveGames"]);
  });
  it("maps Minecraft to world/", () => {
    expect(worldSaveDefaults("MINECRAFT")).toEqual(["world"]);
  });
  it("maps Enshrouded, ARK, Zomboid", () => {
    expect(worldSaveDefaults("ENSHROUDED")).toEqual(["enshrouded-server/savegame"]);
    expect(worldSaveDefaults("ARK")).toEqual(["ark-server/ShooterGame/Saved/SavedArksLocal"]);
    expect(worldSaveDefaults("ZOMBOID")).toEqual(["zomboid-server/zomboid-data/Saves"]);
  });
  it("is case-insensitive", () => {
    expect(worldSaveDefaults("palworld")).toEqual(["palworld-server/Pal/Saved/SaveGames"]);
  });
  it("returns [] for Valheim (saves live outside the server dir)", () => {
    expect(worldSaveDefaults("VALHEIM")).toEqual([]);
  });
  it("returns [] for unknown games", () => {
    expect(worldSaveDefaults("SOMETHING_ELSE")).toEqual([]);
  });
});

describe("isKnownGame", () => {
  it("recognizes Valheim as known even though its defaults are []", () => {
    expect(isKnownGame("VALHEIM")).toBe(true);
  });
  it("recognizes Palworld as known", () => {
    expect(isKnownGame("PALWORLD")).toBe(true);
  });
  it("returns false for unknown games", () => {
    expect(isKnownGame("SOMETHING_ELSE")).toBe(false);
  });
  it("is case-insensitive", () => {
    expect(isKnownGame("valheim")).toBe(true);
  });
});
