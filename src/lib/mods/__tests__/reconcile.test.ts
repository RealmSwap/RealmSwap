import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Mod rows ↔ disk reconciliation. Real filesystem in a temp dir; only the DB
 * and dataRoot are mocked. The scenarios mirror what restores leave behind:
 * files rolled away while rows survive, and files restored while rows were
 * never (re-)created.
 */

const bag = vi.hoisted(() => ({
  dataRoot: "",
  server: null as any,
  rows: [] as any[],
  deletes: [] as any[],
  creates: [] as any[],
  updates: [] as any[],
  workshopVersions: {} as Record<string, string>,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    get server() {
      return { findUnique: async () => bag.server };
    },
    get modInstallation() {
      return {
        findMany: async (args: any) =>
          args?.where?.provider
            ? bag.rows.filter((r) => !r.provider || r.provider === args.where.provider)
            : bag.rows,
        delete: async (args: any) => {
          bag.deletes.push(args.where.id);
          return {};
        },
        create: async (args: any) => {
          bag.creates.push(args.data);
          return {};
        },
        update: async (args: any) => {
          bag.updates.push(args);
          return {};
        },
      };
    },
  },
}));
vi.mock("@/lib/appPaths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appPaths")>();
  return { ...actual, dataRoot: () => bag.dataRoot };
});
// reconcile re-creating workshop rows does one best-effort version lookup —
// keep it off the network and scriptable per test.
vi.mock("@/lib/mods/workshop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mods/workshop")>();
  return {
    ...actual,
    getWorkshopDetails: vi.fn(async (ids: string[]) => {
      const map = new Map<string, { timeUpdated: string }>();
      for (const id of ids) {
        if (bag.workshopVersions[id]) map.set(id, { timeUpdated: bag.workshopVersions[id] });
      }
      return map;
    }),
  };
});

import { reconcileInstalledMods } from "@/lib/mods/reconcile";

let tmp = "";

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs-reconcile-"));
  bag.dataRoot = tmp;
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  bag.server = null;
  bag.rows = [];
  bag.deletes = [];
  bag.creates = [];
  bag.updates = [];
  bag.workshopVersions = {};
  fs.rmSync(path.join(tmp, "local-servers"), { recursive: true, force: true });
});

const serverRoot = (serverId = "s1") => path.join(tmp, "local-servers", serverId);

describe("reconcileInstalledMods", () => {
  it("does nothing without a server row", async () => {
    const result = await reconcileInstalledMods("missing");
    expect(result).toEqual({ removed: 0, added: 0, repaired: 0 });
    expect(bag.creates).toHaveLength(0);
  });

  it("does nothing for games without disk-verifiable mods", async () => {
    bag.server = { id: "s1", game: "ENSHROUDED" };
    await reconcileInstalledMods("s1");
    expect(bag.deletes).toHaveLength(0);
    expect(bag.creates).toHaveLength(0);
  });

  describe("Minecraft", () => {
    it("deletes rows whose jar is gone, adds rows for un-rowed jars, ignores staging files", async () => {
      fs.mkdirSync(path.join(serverRoot(), "mods"), { recursive: true });
      fs.writeFileSync(path.join(serverRoot(), "mods", "modA.jar"), "a");
      fs.writeFileSync(path.join(serverRoot(), "mods", "modB.jar"), "b");
      fs.writeFileSync(path.join(serverRoot(), "mods", ".staging-999.jar"), "tmp");
      bag.server = { id: "s1", game: "MINECRAFT" };
      bag.rows = [
        { id: "r1", packageId: "modA", provider: "modrinth" },
        { id: "r2", packageId: "modGone", provider: "modrinth" },
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 1, repaired: 0 });
      expect(bag.deletes).toEqual(["r2"]);
      expect(bag.creates).toEqual([
        { serverId: "s1", provider: "modrinth", packageId: "modB", version: "unknown", name: "modB" },
      ]);
    });

    it("treats a missing mods dir as nothing installed", async () => {
      bag.server = { id: "s1", game: "MINECRAFT" };
      bag.rows = [{ id: "r1", packageId: "modA", provider: "modrinth" }];

      const result = await reconcileInstalledMods("s1");

      expect(result.removed).toBe(1);
      expect(bag.deletes).toEqual(["r1"]);
    });

    it("removes phantom CurseForge rows after a pack rollback", async () => {
      fs.mkdirSync(path.join(serverRoot(), "mods"), { recursive: true });
      // A rolled-back pack: its jars are gone, but a manual CF jar remains.
      fs.writeFileSync(path.join(serverRoot(), "mods", "67890.jar"), "c");
      bag.server = { id: "s1", game: "MINECRAFT" };
      bag.rows = [
        { id: "r1", packageId: "574123", provider: "curseforge" }, // rolled away
        { id: "r2", packageId: "67890", provider: "curseforge" }, // still on disk
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result.removed).toBe(1);
      expect(bag.deletes).toEqual(["r1"]);
      // The on-disk jar still gets its minimal modrinth-keyed row (unknown
      // jars can't be attributed to a provider from disk alone — unchanged).
      expect(bag.creates).toEqual([
        { serverId: "s1", provider: "modrinth", packageId: "67890", version: "unknown", name: "67890" },
      ]);
    });
  });

  describe("Valheim", () => {
    const valheimDir = () => path.join(serverRoot(), "valheim-server");

    it("keys rows on plugin folders and the BepInEx marker", async () => {
      fs.mkdirSync(path.join(valheimDir(), "BepInEx", "plugins", "owner-pkgA"), { recursive: true });
      fs.mkdirSync(path.join(valheimDir(), "BepInEx", "plugins", "owner-pkgC"), { recursive: true });
      fs.writeFileSync(path.join(valheimDir(), "BepInEx", "plugins", ".hidden.staging.zip"), "tmp");
      fs.writeFileSync(path.join(valheimDir(), "doorstop_config.ini"), "[config]");
      bag.server = { id: "s1", game: "VALHEIM" };
      bag.rows = [
        { id: "r1", packageId: "owner-pkgA" },
        { id: "r2", packageId: "owner-pkgGone" },
        { id: "r3", packageId: "denikson-BepInExPack_Valheim" },
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 1, repaired: 0 });
      expect(bag.deletes).toEqual(["r2"]);
      expect(bag.creates).toEqual([
        { serverId: "s1", provider: "thunderstore", packageId: "owner-pkgC", version: "unknown", name: "owner-pkgC" },
      ]);
    });

    it("deletes the BepInEx core row when the marker file is gone", async () => {
      bag.server = { id: "s1", game: "VALHEIM" };
      bag.rows = [{ id: "r1", packageId: "denikson-BepInExPack_Valheim" }];

      const result = await reconcileInstalledMods("s1");

      expect(result.removed).toBe(1);
      expect(bag.deletes).toEqual(["r1"]);
    });
  });

  describe("Zomboid", () => {
    const iniPath = () =>
      path.join(serverRoot(), "zomboid-server", "zomboid-data", "Server", "servertest.ini");

    function writeIni(workshopIds: string[], modIds: string[]) {
      fs.mkdirSync(path.dirname(iniPath()), { recursive: true });
      fs.writeFileSync(
        iniPath(),
        `WorkshopItems=${workshopIds.join(";")}\nMods=${modIds.join(";")}\n`
      );
    }

    it("restores the Workshop time_updated on re-created rows so update checks keep working", async () => {
      fs.mkdirSync(path.join(serverRoot(), "zomboid-server", "zomboid-data", "Server"), { recursive: true });
      fs.writeFileSync(
        path.join(serverRoot(), "zomboid-server", "zomboid-data", "Server", "servertest.ini"),
        "WorkshopItems=2875848298\n"
      );
      bag.workshopVersions["2875848298"] = "2026-01-02T03:04:05.000Z";
      bag.server = { id: "s1", game: "ZOMBOID" };
      bag.rows = [];

      const result = await reconcileInstalledMods("s1");

      expect(result.added).toBe(1);
      // The ISO version is what the update checks gate on — without it the
      // re-created row could never be update-checked again.
      expect(bag.creates[0]).toMatchObject({
        packageId: "2875848298",
        version: "2026-01-02T03:04:05.000Z",
      });
    });

    it("keys rows on WorkshopItems, repairs stale workshopModId, deletes gone ids", async () => {
      writeIni(["w1", "w2", "2875848298"], ["m1", "m2"]);
      bag.server = { id: "s1", game: "ZOMBOID" };
      bag.rows = [
        { id: "r1", packageId: "w1", workshopModId: "m1" },
        { id: "r2", packageId: "w2", workshopModId: "mStale" },
        { id: "r3", packageId: "wGone", workshopModId: null },
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 1, repaired: 1 });
      expect(bag.deletes).toEqual(["r3"]);
      expect(bag.updates).toEqual([{ where: { id: "r2" }, data: { workshopModId: null } }]);
      // New rows fall back to curated names where the id is known.
      expect(bag.creates).toEqual([
        {
          serverId: "s1",
          provider: "workshop",
          packageId: "2875848298",
          version: "Workshop",
          name: "Common Sense",
        },
      ]);
    });

    it("trims stale ids from ';'-joined multi-mod rows without nulling survivors", async () => {
      writeIni(["w1"], ["m1"]);
      bag.server = { id: "s1", game: "ZOMBOID" };
      bag.rows = [{ id: "r1", packageId: "w1", workshopModId: "m1;m2;m3" }];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 0, added: 0, repaired: 1 });
      expect(bag.updates).toEqual([{ where: { id: "r1" }, data: { workshopModId: "m1" } }]);
    });

    it("treats a missing ini as nothing installed", async () => {
      bag.server = { id: "s1", game: "ZOMBOID" };
      bag.rows = [{ id: "r1", packageId: "w1", workshopModId: "m1" }];

      const result = await reconcileInstalledMods("s1");

      expect(result.removed).toBe(1);
      expect(result.added).toBe(0);
    });
  });

  describe("ARK", () => {
    const arkIni = () =>
      path.join(serverRoot(), "ark-server", "ShooterGame", "Saved", "Config", "WindowsServer", "GameUserSettings.ini");

    function writeArkIni(activeMods: string[]) {
      fs.mkdirSync(path.dirname(arkIni()), { recursive: true });
      fs.writeFileSync(arkIni(), `[ServerSettings]\nActiveMods=${activeMods.join(",")}\n[SessionSettings]\nSessionName=x\n`);
    }

    it("keys rows on ActiveMods, deletes gone ids, adds new ones", async () => {
      writeArkIni(["731604991", "1404697612"]);
      bag.server = { id: "s1", game: "ARK" };
      bag.rows = [
        { id: "r1", packageId: "731604991", workshopModId: null },
        { id: "r2", packageId: "gone", workshopModId: null },
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 1, repaired: 0 });
      expect(bag.deletes).toEqual(["r2"]);
      expect(bag.creates).toEqual([
        {
          serverId: "s1",
          provider: "workshop",
          packageId: "1404697612",
          version: "Workshop",
          name: "Workshop 1404697612",
        },
      ]);
    });

    it("treats a missing ini as nothing installed", async () => {
      bag.server = { id: "s1", game: "ARK" };
      bag.rows = [{ id: "r1", packageId: "731604991", workshopModId: null }];

      const result = await reconcileInstalledMods("s1");

      expect(result.removed).toBe(1);
      expect(result.added).toBe(0);
    });
  });

  describe("Terraria (tModLoader)", () => {
    const contentRoot = () => path.join(serverRoot(), "tmodloader", "steamapps", "workshop", "content", "1281930");

    function writeTmlInstall(items: Record<string, string[]>, enabled: string[]) {
      const install = path.join(serverRoot(), "tmodloader");
      fs.mkdirSync(install, { recursive: true });
      fs.writeFileSync(
        path.join(install, ".realmswap-tml.json"),
        JSON.stringify({ type: "tmodloader", installedAt: "2026-10-25T00:00:00Z" })
      );
      for (const [id, tmods] of Object.entries(items)) {
        const ver = path.join(contentRoot(), id, "2026.8");
        fs.mkdirSync(ver, { recursive: true });
        for (const t of tmods) fs.writeFileSync(path.join(ver, `${t}.tmod`), "x");
      }
      fs.mkdirSync(path.join(install, "tModLoader-server", "Mods"), { recursive: true });
      fs.writeFileSync(path.join(install, "tModLoader-server", "Mods", "enabled.json"), JSON.stringify(enabled));
    }

    it("keys rows on workshop content dirs: repairs renamed .tmods, deletes gone items (trimming enabled names), adds un-rowed ones", async () => {
      writeTmlInstall(
        { "111": ["A", "B"], "333": ["D"] },
        ["A", "B", "C", "Stale"]
      );
      bag.server = { id: "s1", game: "TERRARIA" };
      bag.rows = [
        { id: "r1", packageId: "111", workshopModId: "A" }, // B is new in this item version
        { id: "r2", packageId: "222", workshopModId: "C" }, // item dir gone
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 1, repaired: 1 });
      expect(bag.deletes).toEqual(["r2"]);
      expect(bag.updates).toEqual([
        { where: { id: "r1" }, data: { workshopModId: "A;B" } },
      ]);
      expect(bag.creates).toEqual([
        { serverId: "s1", provider: "workshop", packageId: "333", version: "unknown", name: "Workshop 333" },
      ]);
      // enabled.json ends with exactly the derivable names: A, B (+D — a
      // newly-added item's names get enabled so tML loads them).
      const enabled = JSON.parse(
        fs.readFileSync(path.join(serverRoot(), "tmodloader", "tModLoader-server", "Mods", "enabled.json"), "utf-8")
      );
      expect([...enabled].sort()).toEqual(["A", "B", "D"]);
    });

    it("is a no-op on a vanilla server (no tModLoader marker)", async () => {
      fs.mkdirSync(path.join(serverRoot(), "terraria-server"), { recursive: true });
      bag.server = { id: "s1", game: "TERRARIA" };
      bag.rows = [{ id: "r1", packageId: "111", workshopModId: "A" }];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 0, added: 0, repaired: 0 });
      expect(bag.deletes).toHaveLength(0);
    });
  });

  describe("VRISING", () => {
    const vrDir = () => path.join(serverRoot(), "vrising-server");

    it("keys rows on plugin folders and the doorstop marker, like Valheim", async () => {
      fs.mkdirSync(path.join(vrDir(), "BepInEx", "plugins", "zfolmt-Bloodcraft"), { recursive: true });
      fs.writeFileSync(path.join(vrDir(), "doorstop_config.ini"), "[doorstop]");
      bag.server = { id: "s1", game: "VRISING" };
      bag.rows = [
        { id: "r1", packageId: "zfolmt-Bloodcraft" },
        { id: "r2", packageId: "zfolmt-Gone" },
        { id: "r3", packageId: "BepInEx-BepInExPack_V_Rising" },
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 0, repaired: 0 });
      expect(bag.deletes).toEqual(["r2"]);
    });

    it("adds minimal rows for disk packages without rows", async () => {
      fs.mkdirSync(path.join(vrDir(), "BepInEx", "plugins", "odjit-KindredCommands"), { recursive: true });
      bag.server = { id: "s1", game: "VRISING" };

      const result = await reconcileInstalledMods("s1");

      expect(result.added).toBe(1);
      expect(bag.creates).toEqual([
        {
          serverId: "s1",
          provider: "thunderstore",
          packageId: "odjit-KindredCommands",
          version: "unknown",
          name: "odjit-KindredCommands",
        },
      ]);
    });
  });

  describe("RUST", () => {
    const rustDir = () => path.join(serverRoot(), "rust-server");

    it("keys rows on plugin .cs files and the Oxide marker", async () => {
      fs.mkdirSync(path.join(rustDir(), "Oxide", "plugins"), { recursive: true });
      fs.writeFileSync(path.join(rustDir(), "Oxide", "plugins", "Kits.cs"), "// Kits");
      fs.writeFileSync(path.join(rustDir(), "Oxide", "plugins", "Clans.cs"), "// Clans");
      fs.mkdirSync(path.join(rustDir(), "RustDedicated_Data", "Managed"), { recursive: true });
      fs.writeFileSync(path.join(rustDir(), "RustDedicated_Data", "Managed", "Oxide.Core.dll"), "oxide");
      bag.server = { id: "s1", game: "RUST" };
      bag.rows = [
        { id: "r1", packageId: "Kits" },
        { id: "r2", packageId: "RemovedPlugin" },
        { id: "r3", packageId: "Oxide" },
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 1, repaired: 0 });
      expect(bag.deletes).toEqual(["r2"]);
      expect(bag.creates).toEqual([
        {
          serverId: "s1",
          provider: "umod",
          packageId: "Clans",
          version: "unknown",
          name: "Clans",
        },
      ]);
    });

    it("ignores non-.cs files in the plugins dir", async () => {
      fs.mkdirSync(path.join(rustDir(), "Oxide", "plugins"), { recursive: true });
      fs.writeFileSync(path.join(rustDir(), "Oxide", "plugins", "Kits.json"), "{}");
      bag.server = { id: "s1", game: "RUST" };
      bag.rows = [];

      await reconcileInstalledMods("s1");

      expect(bag.creates).toHaveLength(0);
    });
  });

  describe("Palworld", () => {
    const palworldDir = () => path.join(serverRoot(), "palworld-server");

    it("keys rows on uninstall manifests, core row on the dwmapi.dll marker", async () => {
      fs.mkdirSync(path.join(palworldDir(), ".realmswap"), { recursive: true });
      fs.writeFileSync(path.join(palworldDir(), ".realmswap", "localcc-HelloWorld.json"), "{}");
      fs.mkdirSync(path.join(palworldDir(), "overlay", "Thunderstore-unreal_shimloader"), { recursive: true });
      fs.writeFileSync(path.join(palworldDir(), "overlay", "Thunderstore-unreal_shimloader", "dwmapi.dll"), "shim");
      bag.server = { id: "s1", game: "PALWORLD" };
      bag.rows = [
        { id: "r1", packageId: "localcc-HelloWorld", provider: "thunderstore" },
        { id: "r2", packageId: "gone-Pkg", provider: "thunderstore" },
        { id: "r3", packageId: "Thunderstore-unreal_shimloader", provider: "thunderstore" },
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 0, repaired: 0 });
      expect(bag.deletes).toEqual(["r2"]);
    });

    it("deletes the core row when the shimloader marker is gone", async () => {
      bag.server = { id: "s1", game: "PALWORLD" };
      bag.rows = [{ id: "r1", packageId: "Thunderstore-unreal_shimloader", provider: "thunderstore" }];

      const result = await reconcileInstalledMods("s1");

      expect(result.removed).toBe(1);
      expect(bag.deletes).toEqual(["r1"]);
    });

    it("adds minimal rows for manifests without rows", async () => {
      fs.mkdirSync(path.join(palworldDir(), ".realmswap"), { recursive: true });
      fs.writeFileSync(path.join(palworldDir(), ".realmswap", "localcc-HelloWorld.json"), "{}");
      bag.server = { id: "s1", game: "PALWORLD" };
      bag.rows = [];

      const result = await reconcileInstalledMods("s1");

      expect(result.added).toBe(1);
      expect(bag.creates).toEqual([
        { serverId: "s1", provider: "thunderstore", packageId: "localcc-HelloWorld", version: "unknown", name: "localcc-HelloWorld" },
      ]);
    });
  });

  describe("Satisfactory", () => {
    it("keys rows on FactoryGame/Mods directories", async () => {
      const modsRoot = path.join(serverRoot(), "satisfactory-server", "FactoryGame", "Mods");
      fs.mkdirSync(path.join(modsRoot, "ModularUI"), { recursive: true });
      fs.mkdirSync(path.join(modsRoot, "TxtHelper"), { recursive: true });
      fs.writeFileSync(path.join(modsRoot, "stray.txt"), "not a mod dir");
      bag.server = { id: "s1", game: "SATISFACTORY" };
      bag.rows = [
        { id: "r1", packageId: "ModularUI", provider: "ficsit" },
        { id: "r2", packageId: "GoneMod", provider: "ficsit" },
      ];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 1, repaired: 0 });
      expect(bag.deletes).toEqual(["r2"]);
      expect(bag.creates).toEqual([
        { serverId: "s1", provider: "ficsit", packageId: "TxtHelper", version: "unknown", name: "TxtHelper" },
      ]);
    });

    it("treats a missing Mods dir as nothing installed", async () => {
      bag.server = { id: "s1", game: "SATISFACTORY" };
      bag.rows = [{ id: "r1", packageId: "ModularUI", provider: "ficsit" }];

      const result = await reconcileInstalledMods("s1");

      expect(result.removed).toBe(1);
      expect(bag.deletes).toEqual(["r1"]);
    });
  });
});
