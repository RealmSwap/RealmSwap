import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";

/**
 * The data-loss class from the backup/restore audit: restore paths that
 * deleted the live world before extracting/copying. These tests pin the new
 * contract — a failed restore must leave the live world byte-identical.
 * Prisma and the reconcile hook are mocked; zip handling and file logic are
 * real.
 */

const bag = vi.hoisted(() => ({
  dataRoot: "",
  backupRow: null as any,
  snapshotRow: null as any,
  offsiteCalls: [] as any[][],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    get backup() {
      return {
        create: async (args: any) => {
          bag.backupRow = { id: "new-backup", ...args.data };
          return bag.backupRow;
        },
        update: async (args: any) => {
          Object.assign(bag.backupRow, args.data);
          return bag.backupRow;
        },
        delete: async () => ({}),
        findUnique: async () => bag.backupRow,
      };
    },
    get serverSnapshot() {
      return {
        findUnique: async () => bag.snapshotRow,
        delete: async () => ({}),
        create: async (args: any) => ({ id: "snap1", ...args.data }),
        update: async (args: any) => ({ ...bag.snapshotRow, id: args.where.id, serverId: "s1", userId: "user1", modCount: 0, ...args.data }),
      };
    },
    get server() {
      return {
        findUnique: async () => ({ id: "s1", game: "MINECRAFT", name: "S1", userId: "user1" }),
        update: async () => ({}),
      };
    },
    get modInstallation() {
      return { count: async () => 0 };
    },
    get activityLog() {
      return { create: async () => ({}) };
    },
  },
}));
vi.mock("@/lib/appPaths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appPaths")>();
  return { ...actual, dataRoot: () => bag.dataRoot };
});
vi.mock("@/lib/offsiteBackup", () => ({
  startOffsiteUpload: (...args: any[]) => {
    bag.offsiteCalls.push(args);
  },
}));
vi.mock("@/lib/mods/reconcile", () => ({
  reconcileInstalledMods: async () => {},
}));

import { restoreBackup, createBackup } from "@/lib/backupService";
import { restoreSnapshot, createSnapshot } from "@/lib/snapshots";

let dir: string;
let worldDir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-safety-"));
  bag.dataRoot = dir;
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(path.join(dir, "local-servers"), { recursive: true, force: true });
  worldDir = path.join(dir, "local-servers", "s1", "world");
  fs.mkdirSync(worldDir, { recursive: true });
  fs.writeFileSync(path.join(worldDir, "level.dat"), "PRECIOUS WORLD DATA");
  fs.writeFileSync(path.join(worldDir, "players.json"), "[]");
  bag.backupRow = null;
  bag.snapshotRow = null;
  bag.offsiteCalls = [];
});

function makeZip(name: string, files: Record<string, string>): string {
  const zip = new AdmZip();
  for (const [entry, content] of Object.entries(files)) zip.addFile(entry, Buffer.from(content, "utf-8"));
  const p = path.join(dir, name);
  zip.writeZip(p);
  return p;
}

function expectWorldIntact() {
  expect(fs.readFileSync(path.join(worldDir, "level.dat"), "utf8")).toBe("PRECIOUS WORLD DATA");
  expect(fs.readFileSync(path.join(worldDir, "players.json"), "utf8")).toBe("[]");
}

describe("restoreBackup", () => {
  it("refuses a corrupt archive WITHOUT touching the live world", async () => {
    const zipPath = makeZip("corrupt.zip", { "level.dat": "x".repeat(10_000) });
    const raw = fs.readFileSync(zipPath);
    fs.writeFileSync(zipPath, raw.subarray(0, Math.floor(raw.length / 2)));

    bag.backupRow = {
      id: "b1",
      serverId: "s1",
      userId: "user1",
      name: "Bad backup",
      game: "MINECRAFT",
      filePath: zipPath,
      server: { id: "s1", status: "STOPPED", name: "S1" },
    };

    await expect(restoreBackup("b1")).rejects.toThrow(/failed verification/i);
    expectWorldIntact();
  });

  it("refuses when the game sentinel file is missing, world untouched", async () => {
    // A Minecraft backup without level.dat is not a world backup.
    const zipPath = makeZip("wrongdir.zip", { "something-else.txt": "oops" });
    bag.backupRow = {
      id: "b2",
      serverId: "s1",
      userId: "user1",
      name: "Wrong dir",
      game: "MINECRAFT",
      filePath: zipPath,
      server: { id: "s1", status: "STOPPED", name: "S1" },
    };

    await expect(restoreBackup("b2")).rejects.toThrow(/level\.dat/);
    expectWorldIntact();
  });

  it("restores a healthy archive over the live world (swap keeps new content)", async () => {
    const zipPath = makeZip("good.zip", { "level.dat": "RESTORED WORLD", "players.json": "[]" });
    bag.backupRow = {
      id: "b3",
      serverId: "s1",
      userId: "user1",
      name: "Good backup",
      game: "MINECRAFT",
      filePath: zipPath,
      server: { id: "s1", status: "STOPPED", name: "S1" },
    };

    await restoreBackup("b3");

    expect(fs.readFileSync(path.join(worldDir, "level.dat"), "utf8")).toBe("RESTORED WORLD");
    expect(fs.existsSync(path.join(worldDir, "players.json"))).toBe(true);
  });

  it("refuses to restore while the server is running", async () => {
    bag.backupRow = {
      id: "b4",
      serverId: "s1",
      userId: "user1",
      name: "Any",
      game: "MINECRAFT",
      filePath: "whatever.zip",
      server: { id: "s1", status: "RUNNING", name: "S1" },
    };
    await expect(restoreBackup("b4")).rejects.toThrow(/stop the server/i);
    expectWorldIntact();
  });
});

describe("createBackup -> restoreBackup round trip", () => {
  it("creates a verified backup and restores it", async () => {
    const backup = await createBackup("s1", "MANUAL");
    expect(backup.filePath).toMatch(/\.zip$/);
    expect(backup.verifiedAt).toBeTruthy();

    // Wipe the world, then restore from the backup.
    fs.rmSync(worldDir, { recursive: true, force: true });
    bag.backupRow = { ...backup, server: { id: "s1", status: "STOPPED", name: "S1" } };
    await restoreBackup(backup.id);
    expectWorldIntact();
  });

  it("hands every completed snapshot to the offsite uploader with its owner context", async () => {
    const backup = await createBackup("s1", "MANUAL");
    expect(bag.offsiteCalls.length).toBe(1);
    const [backupId, serverId, ownerUserId, zipPath, serverName] = bag.offsiteCalls[0];
    expect(backupId).toBe(backup.id);
    expect(serverId).toBe("s1");
    expect(ownerUserId).toBe("user1");
    expect(zipPath).toBe(backup.filePath);
    expect(serverName).toBe("S1");
  });
});

describe("restoreSnapshot", () => {
  it("refuses an empty snapshot folder before touching the server directory", async () => {
    const snapDir = path.join(dir, "snapshots", "snap-empty");
    fs.mkdirSync(snapDir, { recursive: true });
    bag.snapshotRow = { id: "snap-empty", serverId: "s1", path: snapDir };

    await expect(restoreSnapshot("snap-empty")).rejects.toThrow(/empty/i);
    expectWorldIntact();
  });

  it("refuses a missing snapshot folder before touching the server directory", async () => {
    bag.snapshotRow = { id: "snap-gone", serverId: "s1", path: path.join(dir, "snapshots", "never-existed") };

    await expect(restoreSnapshot("snap-gone")).rejects.toThrow(/missing on disk/i);
    expectWorldIntact();
  });

  it("rolls the server directory back to the snapshot content", async () => {
    const snapshot = await createSnapshot("s1", "user1", "test");

    // Mutate the live world after snapshotting.
    fs.writeFileSync(path.join(worldDir, "level.dat"), "MUTATED AFTER SNAPSHOT");
    fs.writeFileSync(path.join(worldDir, "extra.txt"), "leftover");

    bag.snapshotRow = snapshot;
    await restoreSnapshot(snapshot.id);

    expect(fs.readFileSync(path.join(worldDir, "level.dat"), "utf8")).toBe("PRECIOUS WORLD DATA");
    expect(fs.existsSync(path.join(worldDir, "extra.txt"))).toBe(false);
  });
});
