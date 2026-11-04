import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import AdmZip from "adm-zip";
import { createHash } from "crypto";
import { upgradeMinecraftVersion, VersionUpgradeError } from "../versionUpgrade";
import { detectMinecraftVersion, writeLoaderMarker } from "@/lib/mods/mcLoaders";
import { installFabricServer } from "@/lib/mods/mcLoaders";
import { prisma } from "@/lib/db";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBootWithQuarantine } from "@/lib/mods/bootRetry";

const bag = vi.hoisted(() => ({ dataRoot: "" }));

vi.mock("@/lib/appPaths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appPaths")>();
  return { ...actual, dataRoot: () => bag.dataRoot };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    activityLog: { create: vi.fn(async () => ({})) },
    modInstallation: { deleteMany: vi.fn(async () => ({})) },
  },
}));

vi.mock("@/lib/snapshots", () => ({
  createSnapshot: vi.fn(async () => ({ id: "snap-1" })),
  restoreSnapshot: vi.fn(async () => ({})),
  discardSnapshot: vi.fn(async () => ({})),
}));

vi.mock("@/lib/mods/bootRetry", () => ({
  testServerBootWithQuarantine: vi.fn(async () => []),
}));

// The four loader installers are network-heavy boundaries — spy them; the
// marker/detection helpers stay real so tests exercise actual files.
vi.mock("@/lib/mods/mcLoaders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mods/mcLoaders")>();
  return {
    ...actual,
    installFabricServer: vi.fn(async () => ({})),
    installForgeServer: vi.fn(async () => ({})),
    installNeoForgeServer: vi.fn(async () => ({})),
    installQuiltServer: vi.fn(async () => ({})),
  };
});

// The vanilla jar swap downloads through this — writes the bytes staged in
// __newJarBytes so the real swap + version detection run against a real file.
vi.mock("@/lib/download", () => ({
  downloadFile: async (_url: string, dest: string) => {
    fs.writeFileSync(dest, (globalThis as any).__newJarBytes);
  },
}));

const sha1 = (buf: Buffer) => createHash("sha1").update(buf).digest("hex");
const jsonRes = (data: any) => ({ ok: true, status: 200, json: async () => data }) as any;

/** A real server.jar whose version.json reports `id`. */
function jarBytes(id: string): Buffer {
  const zip = new AdmZip();
  zip.addFile("version.json", Buffer.from(JSON.stringify({ id })));
  return zip.toBuffer();
}

function writeServerJar(dir: string, id: string): void {
  fs.writeFileSync(path.join(dir, "server.jar"), jarBytes(id));
}

/** Minimal gzipped NBT level.dat with a DataVersion TAG_Int (see worldVersion.test.ts). */
function writeLevelDat(serverRoot: string, levelName: string, dataVersion: number): void {
  const dir = path.join(serverRoot, levelName);
  fs.mkdirSync(dir, { recursive: true });
  const name = (s: string) => {
    const b = Buffer.from(s, "latin1");
    const len = Buffer.alloc(2);
    len.writeUInt16BE(b.length);
    return Buffer.concat([len, b]);
  };
  const int32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
  };
  const nbt = Buffer.concat([
    Buffer.from([0x0a]), name(""), // root compound
    Buffer.from([0x0a]), name("Data"), // Data compound
    Buffer.from([0x03]), name("DataVersion"), int32(dataVersion),
    Buffer.from([0x00]), // end Data
    Buffer.from([0x00]), // end root
  ]);
  fs.writeFileSync(path.join(dir, "level.dat"), zlib.gzipSync(nbt));
}

/** Stub piston-meta: per-release DataVersion + one server download that
 *  always serves the staged new jar. */
function stubMojang(releases: { id: string; dataVersion: number }[]) {
  vi.stubGlobal("fetch", (async (url: string | URL) => {
    const u = url.toString();
    if (u.includes("version_manifest_v2.json")) {
      return jsonRes({
        versions: releases.map((r) => ({ id: r.id, url: `https://piston-meta/${r.id}.json`, type: "release" })),
      });
    }
    if (u.startsWith("https://piston-meta/")) {
      const id = u.split("/").pop()!.replace(".json", "");
      const rel = releases.find((r) => r.id === id);
      return jsonRes({
        dataVersion: rel?.dataVersion ?? null,
        downloads: {
          server: {
            url: "https://piston-data/server.jar",
            sha1: sha1((globalThis as any).__newJarBytes),
            size: (globalThis as any).__newJarBytes.length,
          },
        },
      });
    }
    return { ok: false, status: 404, json: async () => ({}) } as any;
  }) as any);
}

let root: string;
let serverRoot: string;
const SERVER = { serverId: "srv1", userId: "u1", serverName: "Test Server" };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "verup-"));
  bag.dataRoot = root;
  serverRoot = path.join(root, "local-servers", "srv1");
  fs.mkdirSync(serverRoot, { recursive: true });
  writeServerJar(serverRoot, "1.21.1");
  (globalThis as any).__newJarBytes = jarBytes("1.21.4");
  vi.mocked(testServerBootWithQuarantine).mockResolvedValue([]);
  vi.mocked(createSnapshot).mockClear();
  vi.mocked(restoreSnapshot).mockClear();
  vi.mocked(discardSnapshot).mockClear();
  vi.mocked(prisma.activityLog.create).mockClear();
  vi.mocked(prisma.modInstallation.deleteMany).mockClear();
  vi.mocked(installFabricServer).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
  delete (globalThis as any).__newJarBytes;
});

describe("upgradeMinecraftVersion — preflight", () => {
  it("rejects when the server has no server.jar yet", async () => {
    fs.rmSync(path.join(serverRoot, "server.jar"));
    await expect(
      upgradeMinecraftVersion({ ...SERVER, targetVersion: "1.21.4" })
    ).rejects.toThrow(/start this server once first/);
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("rejects when already running the target version", async () => {
    stubMojang([{ id: "1.21.1", dataVersion: 3700 }]);
    await expect(
      upgradeMinecraftVersion({ ...SERVER, targetVersion: "1.21.1" })
    ).rejects.toThrow(/already running Minecraft 1.21.1/);
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a version Mojang doesn't know", async () => {
    stubMojang([{ id: "1.21.4", dataVersion: 3955 }]);
    await expect(
      upgradeMinecraftVersion({ ...SERVER, targetVersion: "9.9.9" })
    ).rejects.toThrow(/isn't a known Mojang release/);
    expect(createSnapshot).not.toHaveBeenCalled();
  });
});

describe("upgradeMinecraftVersion — happy paths", () => {
  it("upgrades vanilla in place: new jar on disk, world kept, boot verified", async () => {
    stubMojang([
      { id: "1.21.4", dataVersion: 3955 },
      { id: "1.21.1", dataVersion: 3700 },
    ]);
    writeLevelDat(serverRoot, "world", 3700); // older world — an upgrade reads it fine

    const result = await upgradeMinecraftVersion({ ...SERVER, targetVersion: "1.21.4" });

    expect(detectMinecraftVersion(serverRoot)).toBe("1.21.4");
    expect(fs.existsSync(path.join(serverRoot, "world", "level.dat"))).toBe(true);
    expect(result.message).toContain("now runs Minecraft 1.21.4");
    expect(result.warnings.join(" ")).not.toContain("Moved the existing world");
    expect(restoreSnapshot).not.toHaveBeenCalled();
    const logged = vi.mocked(prisma.activityLog.create).mock.calls[0][0].data.details;
    expect(logged).toContain("1.21.1 → 1.21.4");
  });

  it("downgrades move an incompatible world aside and warn", async () => {
    writeServerJar(serverRoot, "1.21.4");
    (globalThis as any).__newJarBytes = jarBytes("1.21.1");
    stubMojang([
      { id: "1.21.4", dataVersion: 3955 },
      { id: "1.21.1", dataVersion: 3700 },
    ]);
    writeLevelDat(serverRoot, "world", 3955); // newer world — 1.21.1 can't load it

    const result = await upgradeMinecraftVersion({ ...SERVER, targetVersion: "1.21.1" });

    expect(fs.existsSync(path.join(serverRoot, "world"))).toBe(false);
    expect(fs.readdirSync(serverRoot).some((d) => d.startsWith("world.pre-mc-1.21.1-"))).toBe(true);
    expect(result.warnings.join(" ")).toContain("Moved the existing world");
  });

  it("reinstalls an existing loader for the new release", async () => {
    stubMojang([{ id: "1.21.4", dataVersion: 3955 }]);
    writeLoaderMarker(serverRoot, {
      type: "fabric",
      loaderVersion: "0.16.9",
      minecraftVersion: "1.21.1",
      installedAt: new Date().toISOString(),
    });

    const result = await upgradeMinecraftVersion({ ...SERVER, targetVersion: "1.21.4" });

    expect(installFabricServer).toHaveBeenCalledWith(serverRoot, "1.21.4", expect.any(Function));
    expect(result.message).toContain("with Fabric reinstalled");
  });

  it("deletes install rows for jars the boot test quarantined", async () => {
    stubMojang([{ id: "1.21.4", dataVersion: 3955 }]);
    vi.mocked(testServerBootWithQuarantine).mockResolvedValue(["badmod.jar"]);

    await upgradeMinecraftVersion({ ...SERVER, targetVersion: "1.21.4" });

    expect(prisma.modInstallation.deleteMany).toHaveBeenCalledWith({
      where: { serverId: "srv1", packageId: "badmod" },
    });
  });
});

describe("upgradeMinecraftVersion — rollback", () => {
  it("restores the snapshot when the boot test fails, and rethrows with warnings", async () => {
    stubMojang([{ id: "1.21.4", dataVersion: 3955 }]);
    vi.mocked(testServerBootWithQuarantine).mockRejectedValue(new Error("boot exploded"));

    let caught: any;
    try {
      await upgradeMinecraftVersion({ ...SERVER, targetVersion: "1.21.4" });
    } catch (err) {
      caught = err;
    }

    expect(caught.message).toBe("boot exploded");
    expect(Array.isArray(caught.warnings)).toBe(true);
    expect(restoreSnapshot).toHaveBeenCalledWith("snap-1");
    expect(discardSnapshot).toHaveBeenCalledWith("snap-1");
  });
});
