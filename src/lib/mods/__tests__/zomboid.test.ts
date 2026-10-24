import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { addZomboidWorkshopMod, removeZomboidWorkshopMod, zomboidServerIniPath } from "../zomboid";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zomboid-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("zomboid servertest.ini merge", () => {
  it("creates both keys (and the Server dir) on a fresh install", () => {
    const ini = zomboidServerIniPath(path.join(dir, "fresh"));
    addZomboidWorkshopMod(ini, "2875848298", "BB_CommonSense");
    const content = fs.readFileSync(ini, "utf-8");
    expect(content).toContain("WorkshopItems=2875848298");
    expect(content).toContain("Mods=BB_CommonSense");
  });

  it("appends to existing keys without touching unrelated lines", () => {
    const ini = path.join(dir, "existing", "servertest.ini");
    fs.mkdirSync(path.dirname(ini), { recursive: true });
    fs.writeFileSync(ini, "Mods=Foo\nWorkshopItems=111\nSaveEveryMin=5\n");
    addZomboidWorkshopMod(ini, "222", "Bar");
    const content = fs.readFileSync(ini, "utf-8");
    expect(content).toContain("Mods=Foo;Bar");
    expect(content).toContain("WorkshopItems=111;222");
    expect(content).toContain("SaveEveryMin=5");
  });

  it("is idempotent and matches whole segments, never substrings", () => {
    const ini = path.join(dir, "segments", "servertest.ini");
    fs.mkdirSync(path.dirname(ini), { recursive: true });
    fs.writeFileSync(ini, "WorkshopItems=2875848298;1234\nMods=BB_CommonSense\n");
    // 875848298 is a substring of 2875848298 but a different workshop id
    addZomboidWorkshopMod(ini, "875848298", "CommonSense");
    const content = fs.readFileSync(ini, "utf-8");
    expect(content).toContain("WorkshopItems=2875848298;1234;875848298");
    expect(content).toContain("Mods=BB_CommonSense;CommonSense");
    // re-adding the same pair changes nothing
    addZomboidWorkshopMod(ini, "875848298", "CommonSense");
    expect(fs.readFileSync(ini, "utf-8")).toBe(content);
  });

  it("removes the Workshop ID from WorkshopItems and the mod ID from Mods, preserving the rest", () => {
    const ini = path.join(dir, "remove", "servertest.ini");
    fs.mkdirSync(path.dirname(ini), { recursive: true });
    fs.writeFileSync(ini, "WorkshopItems=111;222\nMods=Foo;Bar\nSaveEveryMin=5\n");
    removeZomboidWorkshopMod(ini, "222", "Bar");
    const content = fs.readFileSync(ini, "utf-8");
    expect(content).toContain("WorkshopItems=111");
    expect(content).not.toContain("222");
    expect(content).toContain("Mods=Foo");
    expect(content).not.toContain("Bar");
    expect(content).toContain("SaveEveryMin=5");
  });

  it("leaves a missing ini untouched on remove (nothing was ever installed)", () => {
    const ini = path.join(dir, "missing", "servertest.ini");
    removeZomboidWorkshopMod(ini, "1", "x");
    expect(fs.existsSync(ini)).toBe(false);
  });
});

describe("multi-mod workshop items", () => {
  it("registers every mod folder and removes them all together", () => {
    const ini = path.join(dir, "multi", "servertest.ini");
    fs.mkdirSync(path.dirname(ini), { recursive: true });
    fs.writeFileSync(ini, "SaveEveryMin=5\n");

    addZomboidWorkshopMod(ini, "111", ["MO", "MT"]);
    let content = fs.readFileSync(ini, "utf-8");
    expect(content).toContain("WorkshopItems=111");
    expect(content).toContain("Mods=MO;MT");
    expect(content).toContain("SaveEveryMin=5");

    // Idempotent re-add of one id keeps the other.
    addZomboidWorkshopMod(ini, "111", "MO");
    content = fs.readFileSync(ini, "utf-8");
    expect(content).toContain("Mods=MO;MT");

    removeZomboidWorkshopMod(ini, "111", ["MO", "MT"]);
    content = fs.readFileSync(ini, "utf-8");
    expect(content).toContain("WorkshopItems=");
    expect(content).not.toContain("WorkshopItems=111");
    expect(content).toContain("Mods=");
  });
});
