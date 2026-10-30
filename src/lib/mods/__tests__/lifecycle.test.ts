import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// setModDisabled is pure fs/ini mechanics — only the module-graph's prisma
// import needs stubbing.
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { setModDisabled, canToggleMods } from "@/lib/mods/lifecycle";
import { tmlEnabledJsonPath, tmlInstallDir } from "@/lib/mods/tml";
import { arkGameUserSettingsIniPath } from "@/lib/mods/ark";
import { zomboidServerIniPath } from "@/lib/mods/zomboid";

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rs-lifecycle-"));
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
  fs.rmSync(path.join(root, "srv"), { recursive: true, force: true });
});

const serverRoot = () => path.join(root, "srv");
const toggle = (game: string, installation: any, disabled: boolean) =>
  setModDisabled({ serverRoot: serverRoot(), game, installation, disabled });

describe("setModDisabled", () => {
  it("Minecraft renames the jar to .disabled and back", async () => {
    const mods = path.join(serverRoot(), "mods");
    fs.mkdirSync(mods, { recursive: true });
    fs.writeFileSync(path.join(mods, "apple.jar"), "jar");
    const inst = { provider: "modrinth", packageId: "apple" };

    await toggle("MINECRAFT", inst, true);
    expect(fs.existsSync(path.join(mods, "apple.jar"))).toBe(false);
    expect(fs.readFileSync(path.join(mods, "apple.jar.disabled"), "utf-8")).toBe("jar");

    await toggle("MINECRAFT", inst, false);
    expect(fs.readFileSync(path.join(mods, "apple.jar"), "utf-8")).toBe("jar");
  });

  it("Valheim parks the package dir under BepInEx/disabled and back", async () => {
    const plugin = path.join(serverRoot(), "valheim-server", "BepInEx", "plugins", "denikson-PlantEverything");
    fs.mkdirSync(path.join(plugin, "dll"), { recursive: true });
    fs.writeFileSync(path.join(plugin, "dll", "x.dll"), "dll");
    const inst = { provider: "thunderstore", packageId: "denikson-PlantEverything" };

    await toggle("VALHEIM", inst, true);
    expect(fs.existsSync(plugin)).toBe(false);
    expect(
      fs.readFileSync(
        path.join(serverRoot(), "valheim-server", "BepInEx", "disabled", "denikson-PlantEverything", "dll", "x.dll"),
        "utf-8"
      )
    ).toBe("dll");

    await toggle("VALHEIM", inst, false);
    expect(fs.existsSync(plugin)).toBe(true);
  });

  it("Rust parks the plugin .cs under Oxide/plugins_disabled and back", async () => {
    const plugins = path.join(serverRoot(), "rust-server", "Oxide", "plugins");
    fs.mkdirSync(plugins, { recursive: true });
    fs.writeFileSync(path.join(plugins, "Kits.cs"), "cs");
    const inst = { provider: "umod", packageId: "Kits" };

    await toggle("RUST", inst, true);
    expect(fs.existsSync(path.join(plugins, "Kits.cs"))).toBe(false);
    expect(
      fs.readFileSync(path.join(serverRoot(), "rust-server", "Oxide", "plugins_disabled", "Kits.cs"), "utf-8")
    ).toBe("cs");

    await toggle("RUST", inst, false);
    expect(fs.readFileSync(path.join(plugins, "Kits.cs"), "utf-8")).toBe("cs");
  });

  it("Zomboid strips only Mods= on disable; enable re-appends the ids", async () => {
    const ini = zomboidServerIniPath(serverRoot());
    fs.mkdirSync(path.dirname(ini), { recursive: true });
    fs.writeFileSync(ini, "WorkshopItems=2875848298\nMods=BB_CommonSense\n");
    const inst = { provider: "workshop", packageId: "2875848298", workshopModId: "BB_CommonSense" };

    const { workshopModId } = await toggle("ZOMBOID", inst, true);
    expect(workshopModId).toBe("BB_CommonSense"); // pairing kept for re-enable
    const content = fs.readFileSync(ini, "utf-8");
    expect(content).toContain("WorkshopItems=2875848298");
    expect(content).not.toContain("Mods=BB_CommonSense");

    await toggle("ZOMBOID", inst, false);
    const reEnabled = fs.readFileSync(ini, "utf-8");
    expect(reEnabled).toContain("WorkshopItems=2875848298");
    expect(reEnabled).toContain("Mods=BB_CommonSense");
  });

  it("ARK removes and re-adds the ActiveMods entry (content untouched)", async () => {
    const ini = arkGameUserSettingsIniPath(serverRoot());
    fs.mkdirSync(path.dirname(ini), { recursive: true });
    fs.writeFileSync(ini, "[ServerSettings]\nActiveMods=731604991,1404697612\n");
    const inst = { provider: "workshop", packageId: "731604991" };

    await toggle("ARK", inst, true);
    expect(fs.readFileSync(ini, "utf-8")).toContain("ActiveMods=1404697612");
    expect(fs.readFileSync(ini, "utf-8")).not.toContain("731604991");

    await toggle("ARK", inst, false);
    expect(fs.readFileSync(ini, "utf-8")).toContain("ActiveMods=");
    expect(fs.readFileSync(ini, "utf-8")).toContain("731604991");
  });

  it("Terraria drops the names from enabled.json and re-enables them", async () => {
    const installDir = tmlInstallDir(serverRoot());
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, ".realmswap-tml.json"), JSON.stringify({ type: "tmodloader" }));
    const enabledJson = tmlEnabledJsonPath(installDir);
    fs.mkdirSync(path.dirname(enabledJson), { recursive: true });
    fs.writeFileSync(enabledJson, JSON.stringify(["CalamityMod", "MagicStorage"]));
    const inst = { provider: "workshop", packageId: "2824688072", workshopModId: "CalamityMod" };

    await toggle("TERRARIA", inst, true);
    expect(JSON.parse(fs.readFileSync(enabledJson, "utf-8"))).toEqual(["MagicStorage"]);

    await toggle("TERRARIA", inst, false);
    expect(JSON.parse(fs.readFileSync(enabledJson, "utf-8"))).toEqual(["MagicStorage", "CalamityMod"]);
  });

  it("Satisfactory parks the mod dir under Mods_disabled and back", async () => {
    const modDir = path.join(serverRoot(), "satisfactory-server", "FactoryGame", "Mods", "TxtHelper");
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(path.join(modDir, "SML.uplugin"), "x");
    const inst = { provider: "ficsit", packageId: "TxtHelper" };

    await toggle("SATISFACTORY", inst, true);
    expect(fs.existsSync(modDir)).toBe(false);
    expect(
      fs.existsSync(path.join(serverRoot(), "satisfactory-server", "FactoryGame", "Mods_disabled", "TxtHelper"))
    ).toBe(true);

    await toggle("SATISFACTORY", inst, false);
    expect(fs.existsSync(modDir)).toBe(true);
  });

  it("Palworld refuses honestly and canToggleMods gates the UI path", async () => {
    expect(canToggleMods("PALWORLD")).toBe(false);
    expect(canToggleMods("VALHEIM")).toBe(true);
    await expect(
      toggle("PALWORLD", { provider: "thunderstore", packageId: "localcc-HelloWorld" }, true)
    ).rejects.toThrow(/can't be disabled without uninstalling/i);
  });
});
