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
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    get server() {
      return { findUnique: async () => bag.server };
    },
    get modInstallation() {
      return {
        findMany: async () => bag.rows,
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
vi.mock("@/lib/appPaths", () => ({ dataRoot: () => bag.dataRoot }));

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
    bag.server = { id: "s1", game: "ARK" };
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
      bag.rows = [{ id: "r1", packageId: "modA" }, { id: "r2", packageId: "modGone" }];

      const result = await reconcileInstalledMods("s1");

      expect(result).toEqual({ removed: 1, added: 1, repaired: 0 });
      expect(bag.deletes).toEqual(["r2"]);
      expect(bag.creates).toEqual([
        { serverId: "s1", provider: "modrinth", packageId: "modB", version: "unknown", name: "modB" },
      ]);
    });

    it("treats a missing mods dir as nothing installed", async () => {
      bag.server = { id: "s1", game: "MINECRAFT" };
      bag.rows = [{ id: "r1", packageId: "modA" }];

      const result = await reconcileInstalledMods("s1");

      expect(result.removed).toBe(1);
      expect(bag.deletes).toEqual(["r1"]);
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
});
