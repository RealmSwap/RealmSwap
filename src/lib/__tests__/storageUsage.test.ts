import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { classifyServerDir, walkServerStorage } from "../storageUsage";

/**
 * The storage breakdown. Classification is pinned against getSavePath
 * (backupPaths.ts) — "worlds" must mean exactly what backups protect — and
 * the walk is exercised against a real temp directory laid out like an
 * ARK/Zomboid install (the games where worlds/logs/mods nest deepest).
 */

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "storage-usage-"));
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const write = (rel: string, size: number) => {
  const full = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(size, 1));
};

describe("classifyServerDir", () => {
  it("classifies each game's world folder exactly as backups read it", () => {
    expect(classifyServerDir("MINECRAFT", "world")).toBe("worlds");
    expect(classifyServerDir("MINECRAFT", "world/region/r.0.0.mca")).toBe("worlds");
    expect(classifyServerDir("ZOMBOID", "zomboid-server/zomboid-data/Saves/Multiplayer/servertest")).toBe("worlds");
    expect(classifyServerDir("ARK", "ark-server/ShooterGame/Saved/SavedArksLocal/MyMap.ark")).toBe("worlds");
    expect(classifyServerDir("ENSHROUDED", "enshrouded-server/savegame")).toBe("worlds");
  });

  it("keeps ARK's Saved/SavedArksLocal (worlds) apart from Saved/Logs (logs)", () => {
    expect(classifyServerDir("ARK", "ark-server/ShooterGame/Saved/Logs")).toBe("logs");
    expect(classifyServerDir("ARK", "ark-server/ShooterGame/Saved/Logs/Server.log")).toBe("logs");
  });

  it("classifies mods and logs per game", () => {
    expect(classifyServerDir("MINECRAFT", "mods")).toBe("mods");
    expect(classifyServerDir("MINECRAFT", "mods/fabric-api.jar")).toBe("mods");
    expect(classifyServerDir("VALHEIM", "BepInEx/plugins/EpicLoot.dll")).toBe("mods");
    expect(classifyServerDir("ZOMBOID", "steamapps/workshop/content/108600/2169435967")).toBe("mods");
    expect(classifyServerDir("MINECRAFT", "logs/latest.log")).toBe("logs");
    expect(classifyServerDir("ZOMBOID", "zomboid-server/zomboid-data/Logs/console.txt")).toBe("logs");
  });

  it("leaves game binaries and unknown games in other (no guessing)", () => {
    expect(classifyServerDir("MINECRAFT", "server.jar")).toBeNull();
    expect(classifyServerDir("MINECRAFT", "libraries")).toBeNull();
    expect(classifyServerDir("MINECRAFT", "")).toBeNull();
    // Unknown games still get the generic logs/ folder; nothing else is guessed.
    expect(classifyServerDir("SOMEOTHERGAME", "logs/x.txt")).toBe("logs");
    expect(classifyServerDir("SOMEOTHERGAME", "world")).toBeNull();
    expect(classifyServerDir("SOMEOTHERGAME", "whatever/deep.bin")).toBeNull();
  });
});

describe("walkServerStorage", () => {
  it("splits an ARK-shaped folder into worlds / mods / logs / other", async () => {
    write("ark-server/ShooterGame/Saved/SavedArksLocal/MyMap.ark", 400);
    write("ark-server/ShooterGame/Content/Mods/731604195/ModInfo.lua", 300);
    write("ark-server/ShooterGame/Saved/Logs/Server.log", 200);
    write("ShooterGame/Binaries/Win64/ArkServer.exe", 100);

    const out = await walkServerStorage(tmp, "ARK");
    expect(out).toEqual({
      totalBytes: 1000,
      worldsBytes: 400,
      modsBytes: 300,
      logsBytes: 200,
      otherBytes: 100,
    });
  });

  it("buckets a Minecraft install and returns null for a missing folder", async () => {
    write("world/level.dat", 50);
    write("mods/jei.jar", 20);
    write("logs/latest.log", 10);
    write("server.jar", 5);

    const out = await walkServerStorage(tmp, "MINECRAFT");
    expect(out?.worldsBytes).toBe(50);
    expect(out?.modsBytes).toBe(20);
    expect(out?.logsBytes).toBe(10);
    expect(out?.otherBytes).toBe(5);
    expect(out?.totalBytes).toBe(85);

    expect(await walkServerStorage(path.join(tmp, "nope"), "MINECRAFT")).toBeNull();
  });
});
