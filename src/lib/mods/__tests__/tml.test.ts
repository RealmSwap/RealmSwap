import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  tmlInstallDir, tmlEnabledJsonPath, tmlMarkerPath, readTmlMarker, writeTmlMarker,
  readTmlEnabledMods, addTmlEnabledMods, removeTmlEnabledMods,
  deriveTmodNames, isClientOnlyWorkshopItem, rewriteWorldArgForTml,
  removeTmlWorkshopMod, tmlLaunchArgs, assertNoTmlForContainerRunner,
} from "../tml";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tml-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("tml marker", () => {
  it("round-trips and reads null when absent or foreign", () => {
    const install = tmlInstallDir(path.join(dir, "m1"));
    expect(readTmlMarker(install)).toBeNull();
    fs.mkdirSync(install, { recursive: true });
    writeTmlMarker(install, { type: "tmodloader", installedAt: "2026-10-25T00:00:00Z" });
    expect(readTmlMarker(install)).toEqual({ type: "tmodloader", installedAt: "2026-10-25T00:00:00Z" });
    expect(tmlMarkerPath(install)).toBe(path.join(install, ".realmswap-tml.json"));

    const foreign = tmlInstallDir(path.join(dir, "m2"));
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(tmlMarkerPath(foreign), JSON.stringify({ type: "other" }));
    expect(readTmlMarker(foreign)).toBeNull();
  });
});

describe("enabled.json", () => {
  const enabledFor = (name: string) => tmlEnabledJsonPath(tmlInstallDir(path.join(dir, name)));

  it("reads [] for a missing or malformed file", () => {
    expect(readTmlEnabledMods(enabledFor("missing"))).toEqual([]);
    const install = tmlInstallDir(path.join(dir, "malformed"));
    fs.mkdirSync(path.dirname(tmlEnabledJsonPath(install)), { recursive: true });
    fs.writeFileSync(tmlEnabledJsonPath(install), "{not json");
    expect(readTmlEnabledMods(tmlEnabledJsonPath(install))).toEqual([]);
  });

  it("adds names idempotently, creating the Mods dir, preserving foreign entries", () => {
    const p = enabledFor("add");
    addTmlEnabledMods(p, ["BossMiner"]);
    addTmlEnabledMods(p, ["BossMiner", "MagicStorage"]);
    expect(readTmlEnabledMods(p)).toEqual(["BossMiner", "MagicStorage"]);
    // hand-edit a foreign entry in — it must survive a later remove
    fs.writeFileSync(p, JSON.stringify(["BossMiner", "MagicStorage", "SomeoneElses"]));
    removeTmlEnabledMods(p, ["BossMiner"]);
    expect(readTmlEnabledMods(p)).toEqual(["MagicStorage", "SomeoneElses"]);
  });

  it("remove on a never-created file creates an empty file, not a crash", () => {
    const p = enabledFor("remove-fresh");
    removeTmlEnabledMods(p, ["X"]);
    expect(readTmlEnabledMods(p)).toEqual([]);
  });
});

describe("deriveTmodNames", () => {
  it("derives names from .tmods under version folders, deduped", () => {
    const content = path.join(dir, "item-1");
    fs.mkdirSync(path.join(content, "2026.8"), { recursive: true });
    fs.mkdirSync(path.join(content, "2025.9"), { recursive: true });
    fs.writeFileSync(path.join(content, "2026.8", "BossMiner.tmod"), "x");
    fs.writeFileSync(path.join(content, "2025.9", "BossMiner.tmod"), "x");
    fs.writeFileSync(path.join(content, "2026.8", "MagicStorage.tmod"), "x");
    fs.writeFileSync(path.join(content, "workshop.json"), "{}");
    expect(deriveTmodNames(content).map((d) => d.name).sort()).toEqual(["BossMiner", "MagicStorage"]);
  });

  it("throws when the item carries no .tmod at all", () => {
    const content = path.join(dir, "item-2");
    fs.mkdirSync(content, { recursive: true });
    fs.writeFileSync(path.join(content, "workshop.json"), "{}");
    expect(() => deriveTmodNames(content)).toThrow(/not a tModLoader mod/);
  });
});

describe("client-only gate", () => {
  const item = (name: string, tags: string[] | null) => {
    const content = path.join(dir, name);
    fs.mkdirSync(content, { recursive: true });
    if (tags !== null) fs.writeFileSync(path.join(content, "workshop.json"), JSON.stringify({ Tags: tags }));
    return content;
  };
  it("refuses Client / Client Only tags", () => {
    expect(isClientOnlyWorkshopItem(item("c1", ["Utilities", "Client"]))).toBe(true);
    expect(isClientOnlyWorkshopItem(item("c2", ["Utilities", "Client Only"]))).toBe(true);
  });
  it("passes Both, unknown, and missing metadata", () => {
    expect(isClientOnlyWorkshopItem(item("b1", ["Utilities", "Both"]))).toBe(false);
    expect(isClientOnlyWorkshopItem(item("b2", ["No idea"]))).toBe(false);
    expect(isClientOnlyWorkshopItem(item("b3", null))).toBe(false);
  });
});

describe("launch arg surgery", () => {
  it("redirects a relative -world back to the vanilla worlds dir", () => {
    expect(
      rewriteWorldArgForTml(["-port", "7777", "-world", "worlds/My Server.wld", "-players", "8"])
    ).toEqual(["-port", "7777", "-world", "../terraria-server/worlds/My Server.wld", "-players", "8"]);
  });
  it("leaves absolute world paths and arg lists without -world alone", () => {
    expect(rewriteWorldArgForTml(["-world", "/abs/w.wld"])).toEqual(["-world", "/abs/w.wld"]);
    expect(rewriteWorldArgForTml(["-port", "7777"])).toEqual(["-port", "7777"]);
  });
  it("launch args pin save + workshop dirs inside the install and go headless", () => {
    const install = tmlInstallDir(path.join(dir, "launch"));
    const args = tmlLaunchArgs(install);
    expect(args).toContain("-nosteam");
    expect(args).toContain(path.join(install, "tModLoader-server"));
    expect(args).toContain(path.join(install, "steamapps", "workshop"));
  });
});

describe("uninstall", () => {
  it("drops enabled names and deletes the item's content dir only", () => {
    const root = path.join(dir, "un1");
    const install = tmlInstallDir(root);
    const contentRoot = path.join(install, "steamapps", "workshop", "content", "1281930");
    fs.mkdirSync(path.join(contentRoot, "111", "2026.8"), { recursive: true });
    fs.mkdirSync(path.join(contentRoot, "222"), { recursive: true });
    fs.writeFileSync(path.join(contentRoot, "111", "2026.8", "A.tmod"), "x");
    fs.writeFileSync(path.join(contentRoot, "222", "keep.txt"), "x");
    addTmlEnabledMods(tmlEnabledJsonPath(install), ["A", "B"]);

    removeTmlWorkshopMod(root, "111", ["A"]);

    expect(fs.existsSync(path.join(contentRoot, "111"))).toBe(false);
    expect(fs.existsSync(path.join(contentRoot, "222"))).toBe(true);
    expect(readTmlEnabledMods(tmlEnabledJsonPath(install))).toEqual(["B"]);
  });
});

describe("container-runner honesty guard", () => {
  it("throws when the marker is present, passes when absent", () => {
    const root = path.join(dir, "guard");
    assertNoTmlForContainerRunner(root); // no marker — fine
    const install = tmlInstallDir(root);
    fs.mkdirSync(install, { recursive: true });
    writeTmlMarker(install, { type: "tmodloader", installedAt: "now" });
    expect(() => assertNoTmlForContainerRunner(root)).toThrow(/Windows local runner/);
  });
});
