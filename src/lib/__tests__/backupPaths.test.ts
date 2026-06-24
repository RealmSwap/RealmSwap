import { describe, it, expect } from "vitest";
import path from "path";
import { getSavePath } from "../backupPaths";

const roots = { dataRoot: path.join("DATA"), userProfile: path.join("USERS", "me") };
const id = "srv-123";

describe("getSavePath", () => {
  it("maps Minecraft to the server's world directory", () => {
    const dir = path.join("DATA", "local-servers", id, "world");
    expect(getSavePath("MINECRAFT", id, roots)).toEqual({
      srcDir: dir,
      zipPattern: `${dir}/*`,
      destExtractDir: dir,
    });
  });

  it("maps Valheim to the user profile's worlds_local directory with Dedicated.*", () => {
    const dir = path.join("USERS", "me", "AppData", "LocalLow", "IronGate", "Valheim", "worlds_local");
    expect(getSavePath("VALHEIM", id, roots)).toEqual({
      srcDir: dir,
      zipPattern: `${dir}/Dedicated.*`,
      destExtractDir: dir,
    });
  });

  it("maps Enshrouded to its savegame directory", () => {
    const dir = path.join("DATA", "local-servers", id, "enshrouded-server", "savegame");
    expect(getSavePath("ENSHROUDED", id, roots).srcDir).toBe(dir);
  });

  it("maps Zomboid to the Multiplayer/servertest saves directory", () => {
    const dir = path.join(
      "DATA", "local-servers", id, "zomboid-server", "zomboid-data", "Saves", "Multiplayer", "servertest"
    );
    expect(getSavePath("ZOMBOID", id, roots).srcDir).toBe(dir);
  });

  it("maps Ark to its SavedArksLocal directory", () => {
    const dir = path.join("DATA", "local-servers", id, "ark-server", "ShooterGame", "Saved", "SavedArksLocal");
    expect(getSavePath("ARK", id, roots).srcDir).toBe(dir);
  });

  it("matches the game type case-insensitively", () => {
    expect(getSavePath("minecraft", id, roots)).toEqual(getSavePath("MINECRAFT", id, roots));
  });

  it("throws for an unsupported game type", () => {
    expect(() => getSavePath("DOOM", id, roots)).toThrow(/Unsupported game type: DOOM/);
  });
});
