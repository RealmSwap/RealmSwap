import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";

/**
 * Palworld shimloader layout planning + materialization. Pure filesystem
 * tests in a temp dir — no network, no DB.
 */

import {
  planPalworldPackage, applyPalworldPlan, uninstallPalworldPackage,
  shimloaderLaunchArgs, shimloaderMarkerPath,
  SHIMLOADER_PACKAGE_ID, PALWORLD_MODS_DIR, PALWORLD_PAKS_DIR, PALWORLD_OVERLAY_DIR,
} from "@/lib/mods/palworld";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "palworld-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  fs.rmSync(path.join(dir, "pw"), { recursive: true, force: true });
});

function zipFrom(entries: Record<string, string | Buffer>): AdmZip {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, typeof content === "string" ? Buffer.from(content) : content);
  }
  return zip;
}

describe("planPalworldPackage", () => {
  it("maps a mod/ root into mods/<packageName>/", () => {
    const zip = zipFrom({
      "mod/enabled.txt": "",
      "mod/dlls/main.dll": "dll",
      "mod/scripts/main.lua": "lua",
      "icon.png": "", "manifest.json": "{}", "README.md": "",
    });
    const plan = planPalworldPackage({ zip, fullName: "localcc-ReplicationEnabler", packageName: "ReplicationEnabler" });
    expect(plan.files.map((f) => f.destRel).sort()).toEqual([
      "mods/ReplicationEnabler/dlls/main.dll",
      "mods/ReplicationEnabler/enabled.txt",
      "mods/ReplicationEnabler/scripts/main.lua",
    ]);
  });

  it("maps a pak/ root (with sibling data folders) into paks/", () => {
    const zip = zipFrom({
      "pak/MyMod_P.pak": "pak",
      "pak/MyModData/Config.json": "{}",
    });
    const plan = planPalworldPackage({ zip, fullName: "Zurr-PalPod", packageName: "PalPod" });
    expect(plan.files.map((f) => f.destRel).sort()).toEqual([
      "paks/MyModData/Config.json",
      "paks/MyMod_P.pak",
    ]);
  });

  it("maps game-rooted package paths (BasesPlus layout) into the manager dirs", () => {
    const zip = zipFrom({
      "Pal/Binaries/Win64/Mods/BasesPlus/Enabled.txt": "",
      "Pal/Binaries/Win64/Mods/BasesPlus/Scripts/main.lua": "",
      "Pal/Content/Paks/LogicMods/BasesPlus.pak": "",
      "Pal/Content/Paks/LogicMods/BasesPlus.modconfig.json": "{}",
      "manifest.json": "{}", "icon.png": "",
    });
    const plan = planPalworldPackage({ zip, fullName: "PalModders-BasesPlus", packageName: "BasesPlus" });
    const dests = plan.files.map((f) => f.destRel).sort();
    expect(dests).toEqual([
      "mods/BasesPlus/Enabled.txt",
      "mods/BasesPlus/Scripts/main.lua",
      "paks/BasesPlus.modconfig.json",
      "paks/BasesPlus.pak",
    ]);
  });

  it("maps Win64-rooted files outside Mods/ into the overlay wrapper dir", () => {
    const zip = zipFrom({
      "Pal/Binaries/Win64/custom.dll": "dll",
      "manifest.json": "{}",
    });
    const plan = planPalworldPackage({ zip, fullName: "Some-Wrapper", packageName: "Wrapper" });
    expect(plan.files).toEqual([
      { entry: "Pal/Binaries/Win64/custom.dll", destRel: "overlay/Some-Wrapper/custom.dll" },
    ]);
  });

  it("maps Pal/Config files into cfgs/", () => {
    const zip = zipFrom({ "Pal/Config/DefaultGame.ini": "x" });
    const plan = planPalworldPackage({ zip, fullName: "A-B", packageName: "B" });
    expect(plan.files[0].destRel).toBe("cfgs/DefaultGame.ini");
  });

  it("refuses Windows installers with an honest message", () => {
    const zip = zipFrom({ "Gale_1.23.2_x64_en-US.msi": "binary", "manifest.json": "{}" });
    expect(() =>
      planPalworldPackage({ zip, fullName: "Kesomannen-GaleModManager", packageName: "GaleModManager" })
    ).toThrow(/Windows installer/);
  });

  it("refuses unrecognized layouts before anything is written", () => {
    const zip = zipFrom({ "Sources/Mods/X.uasset": "x", "manifest.json": "{}" });
    expect(() =>
      planPalworldPackage({ zip, fullName: "localcc-HelloWorld", packageName: "HelloWorld" })
    ).toThrow(/Unrecognized file layout/);
  });

  it("refuses a metadata-only package", () => {
    const zip = zipFrom({ "icon.png": "", "manifest.json": "{}", "README.md": "" });
    expect(() =>
      planPalworldPackage({ zip, fullName: "a-b", packageName: "b" })
    ).toThrow(/no mod files/);
  });
});

describe("applyPalworldPlan + uninstallPalworldPackage", () => {
  it("materializes files under palworldDir and records an uninstall manifest", () => {
    const pw = path.join(dir, "pw");
    const zip = zipFrom({
      "mod/enabled.txt": "on",
      "pak/Hello_P.pak": "pakdata",
    });
    const plan = planPalworldPackage({ zip, fullName: "localcc-HelloWorld", packageName: "HelloWorld" });
    const count = applyPalworldPlan({ zip, palworldDir: pw, plan });
    expect(count).toBe(2);
    expect(fs.readFileSync(path.join(pw, "mods", "HelloWorld", "enabled.txt"), "utf-8")).toBe("on");
    expect(fs.readFileSync(path.join(pw, "paks", "Hello_P.pak"), "utf-8")).toBe("pakdata");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pw, ".realmswap", "localcc-HelloWorld.json"), "utf-8")
    );
    expect(manifest.files.sort()).toEqual(["mods/HelloWorld/enabled.txt", "paks/Hello_P.pak"]);
  });

  it("uninstall removes exactly the manifest's files and prunes emptied dirs", () => {
    const pw = path.join(dir, "pw");
    const zip = zipFrom({
      "mod/enabled.txt": "on",
      "mod/scripts/main.lua": "lua",
      "pak/Hello_P.pak": "pakdata",
    });
    const plan = planPalworldPackage({ zip, fullName: "localcc-HelloWorld", packageName: "HelloWorld" });
    applyPalworldPlan({ zip, palworldDir: pw, plan });

    // Another package's file in paks/ must survive.
    fs.mkdirSync(path.join(pw, "paks"), { recursive: true });
    fs.writeFileSync(path.join(pw, "paks", "Other_P.pak"), "keep");

    const result = uninstallPalworldPackage({ palworldDir: pw, fullName: "localcc-HelloWorld" });
    expect(result.manifestMissing).toBe(false);
    expect(fs.existsSync(path.join(pw, "mods", "HelloWorld"))).toBe(false);
    expect(fs.existsSync(path.join(pw, "paks", "Hello_P.pak"))).toBe(false);
    expect(fs.existsSync(path.join(pw, "paks", "Other_P.pak"))).toBe(true);
    expect(fs.existsSync(path.join(pw, ".realmswap", "localcc-HelloWorld.json"))).toBe(false);
  });
});

describe("shimloader plumbing", () => {
  it("marker sits in the overlay wrapper and launch args carry the four manager dirs", () => {
    const pw = path.join(dir, "pw");
    expect(shimloaderMarkerPath(pw)).toBe(
      path.join(pw, PALWORLD_OVERLAY_DIR, SHIMLOADER_PACKAGE_ID, "dwmapi.dll")
    );
    const args = shimloaderLaunchArgs(pw);
    expect(args).toHaveLength(4);
    expect(args.map((a) => a.split("=")[0])).toEqual([
      "--mod-dir", "--pak-dir", "--cfg-dir", "--overlay-dir",
    ]);
    for (const arg of args) expect(path.isAbsolute(arg.split("=")[1])).toBe(true);
  });
});
