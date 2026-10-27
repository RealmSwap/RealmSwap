import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { NextRequest } from "next/server";

/**
 * The update-pack route end to end with a canned CurseForge API: the newest
 * pack file is resolved, re-applied through the real plan→apply pipeline,
 * mods that left the new manifest are retired (files + rows), and a new pack
 * identity is recorded. Everything network-shaped runs through a stubbed
 * global fetch; the CF client, pack planning, hash verification and file
 * work are all real.
 */

const bag = vi.hoisted(() => ({
  dataRoot: "",
  access: null as any,
  installedModpack: null as any,
  modpackUpserts: [] as any[],
  upserts: [] as any[],
  deleteMany: [] as any[],
  audit: [] as any[],
  bootError: null as Error | null,
  restored: [] as string[],
  discarded: [] as string[],
  downloadBodies: null as null | ((url: string) => Buffer | null),
  fetchRoutes: null as null | ((url: string, init?: RequestInit) => Response | Promise<Response>),
}));

vi.mock("@/lib/download", () => ({
  downloadFile: async (url: string, dest: string) => {
    const body = bag.downloadBodies?.(url);
    if (!body) throw new Error(`no download body stubbed for ${url}`);
    fs.writeFileSync(dest, body);
  },
}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => ({ id: "user1" }) }));
vi.mock("@/lib/serverAuth", () => ({
  verifyServerAccess: async () => bag.access,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    get installedModpack() {
      return {
        findUnique: async () => bag.installedModpack,
        upsert: async (args: any) => {
          bag.modpackUpserts.push(args);
          return {};
        },
      };
    },
    get modInstallation() {
      return {
        upsert: async (args: any) => {
          bag.upserts.push(args);
          return {};
        },
        deleteMany: async (args: any) => {
          bag.deleteMany.push(args);
          return {};
        },
      };
    },
    get activityLog() {
      return {
        create: async (args: any) => {
          bag.audit.push(args.data);
          return {};
        },
      };
    },
  },
}));
vi.mock("@/lib/snapshots", () => ({
  createSnapshot: async () => ({ id: "snap1" }),
  restoreSnapshot: async (id: string) => {
    bag.restored.push(id);
  },
  discardSnapshot: async (id: string) => {
    bag.discarded.push(id);
  },
}));
vi.mock("@/lib/runners/sandbox", () => ({
  resolveSandboxJava: () => "java",
  testServerBoot: async () => {
    if (bag.bootError) throw bag.bootError;
    return true;
  },
  SandboxBootError: class SandboxBootError extends Error {
    output: string;
    constructor(message: string, output: string) {
      super(message);
      this.name = "SandboxBootError";
      this.output = output;
    }
  },
}));
vi.mock("@/lib/appPaths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/appPaths")>();
  return { ...actual, dataRoot: () => bag.dataRoot };
});

import { GET as getPack, POST as updatePack } from "@/app/api/servers/[id]/mods/update-pack/route";

let dir: string;
const sha1 = (buf: Buffer) => crypto.createHash("sha1").update(buf).digest("hex");

const jar111 = Buffer.from("core-mod-1.2.0 bytes");
const jar222 = Buffer.from("other-mod-2.0.0 bytes");

const cfFile = (id: number, modId: number, displayName: string, fileName: string, body: Buffer) => ({
  id, modId, displayName, fileName,
  isAvailable: true, isAlternate: false,
  gameVersions: ["1.20.1"],
  downloadUrl: null,
  hashes: [{ algo: 1, value: sha1(body) }],
});

const packFiles = [
  cfFile(1110, 111, "Core Mod 1.2.0", "coremod-1.2.0.jar", jar111),
  cfFile(2220, 222, "Other Mod 2.0.0", "othermod-2.0.0.jar", jar222),
];

// What GET /mods/900/files returns: the PACK's own files (newest = 20, the
// server previously installed file 10).
const packListing = [
  { id: 10, modId: 900, displayName: "Test Pack 1.0.0", fileName: "testpack-1.0.0.zip",
    isAvailable: true, isAlternate: false, gameVersions: ["1.20.1"], downloadUrl: null, hashes: [] },
  { id: 20, modId: 900, displayName: "Test Pack 1.1.0", fileName: "testpack-1.1.0.zip",
    isAvailable: true, isAlternate: false, gameVersions: ["1.20.1"], downloadUrl: null, hashes: [] },
];

// The NEW pack file (id 20 > old 10): its manifest drops project 222.
const newPackZip = () => {
  const zip = new AdmZip();
  zip.addFile(
    "manifest.json",
    Buffer.from(JSON.stringify({
      manifestType: "minecraftModpack", manifestVersion: 1,
      name: "Test Pack", version: "1.1.0",
      minecraft: { version: "1.20.1" },
      files: [{ projectID: 111, fileID: 1110, required: true }],
    }))
  );
  return zip;
};

const cfFetchStub = () => async (url: string, init?: RequestInit) => {
  const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
  if (url.startsWith("https://api.curseforge.com/v1/mods/900/files")) return json([...packListing]);
  if (url === "https://api.curseforge.com/v1/mods/files") {
    const bodyIds: number[] = JSON.parse(String(init?.body)).fileIds;
    return json(packFiles.filter((f) => bodyIds.includes(f.id)));
  }
  if (url === "https://api.curseforge.com/v1/mods") {
    const bodyIds: number[] = JSON.parse(String(init?.body)).modIds;
    return json(bodyIds.map((id) => ({ id, name: id === 111 ? "Core Mod" : "Other Mod" })));
  }
  return new Response("unrouted", { status: 404 });
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "update-pack-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(path.join(dir, "local-servers"), { recursive: true, force: true });
  bag.dataRoot = dir;
  bag.access = { server: { id: "s1", name: "MC", game: "MINECRAFT", status: "STOPPED" } };
  bag.modpackUpserts = [];
  bag.upserts = [];
  bag.deleteMany = [];
  bag.audit = [];
  bag.bootError = null;
  bag.restored = [];
  bag.discarded = [];
  bag.downloadBodies = (url) => {
    if (url.includes("testpack-1.1.0.zip")) return newPackZip().toBuffer();
    if (url.includes("coremod-1.2.0.jar")) return jar111;
    if (url.includes("othermod-2.0.0.jar")) return jar222;
    return null;
  };
  bag.fetchRoutes = cfFetchStub();
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => bag.fetchRoutes!(url, init));
  process.env.CURSEFORGE_API_KEY = "test-key";

  const serverRoot = path.join(dir, "local-servers", "s1");
  fs.mkdirSync(serverRoot, { recursive: true });
  const serverJar = new AdmZip();
  serverJar.addFile("version.json", Buffer.from(JSON.stringify({ id: "1.20.1" })));
  fs.writeFileSync(path.join(serverRoot, "server.jar"), serverJar.toBuffer());

  bag.installedModpack = {
    serverId: "s1", kind: "curseforge", projectId: "900", fileId: 10,
    fileName: "oldpack.zip", packName: "Test Pack", version: "1.0.0",
    mcVersion: "1.20.1", loaderType: null, loaderVersion: null,
    packageIds: JSON.stringify(["111", "222", "333"]),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CURSEFORGE_API_KEY;
});

function post(url = "/api/servers/s1/mods/update-pack") {
  return updatePack(new NextRequest(`http://localhost${url}`, { method: "POST" }), { params: Promise.resolve({ id: "s1" }) });
}

describe("update-pack route", () => {
  it("re-applies the newest pack file and retires mods that left the manifest", async () => {
    const serverRoot = path.join(dir, "local-servers", "s1");
    const modsDir = path.join(serverRoot, "mods");
    fs.mkdirSync(modsDir, { recursive: true });
    fs.writeFileSync(path.join(modsDir, "222.jar"), Buffer.from("old 222"));
    fs.writeFileSync(path.join(modsDir, "333.jar"), Buffer.from("old 333"));

    const res = await post();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated).toBe(true);
    expect(data.message).toContain("1.1.0");

    // 222 left the manifest → jar + row retired; 333 was recorded by the old
    // pack but has no jar on disk → row retired, file deletion is a no-op.
    expect(fs.existsSync(path.join(modsDir, "222.jar"))).toBe(false);
    const retired = bag.deleteMany.map((d) => d.where.packageId).sort();
    expect(retired).toEqual(["222", "333"]);
    for (const d of bag.deleteMany) expect(d.where.provider).toBe("curseforge");
    expect(bag.upserts.map((u) => u.where.serverId_provider_packageId.packageId)).toEqual(["111"]);

    // New pack identity recorded (fileId 20, new manifest's packageIds only).
    expect(bag.modpackUpserts[0].update).toMatchObject({
      projectId: "900", fileId: 20, version: "1.1.0",
    });
    expect(JSON.parse(bag.modpackUpserts[0].update.packageIds)).toEqual(["111"]);
    expect(bag.audit[0].action).toBe("UPDATE_MODPACK");
    expect(fs.readFileSync(path.join(modsDir, "111.jar"), "utf-8")).toBe("core-mod-1.2.0 bytes");
  });

  it("reports already-up-to-date without spending a snapshot when the file id matches", async () => {
    bag.installedModpack.fileId = 20;
    const res = await post();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated).toBe(false);
    expect(bag.restored).toEqual([]);
  });

  it("404s when no pack is recorded", async () => {
    bag.installedModpack = null;
    const res = await post();
    expect(res.status).toBe(404);
  });

  it("refuses packs without project identity (manual imports) honestly", async () => {
    bag.installedModpack = { ...bag.installedModpack, projectId: null, kind: "mrpack" };
    const res = await post();
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no CurseForge project identity/);
  });

  it("rolls back and keeps the old identity when the boot test fails", async () => {
    bag.bootError = new Error("boot failed");
    const res = await post();
    expect(res.status).toBe(500);
    expect(bag.restored).toEqual(["snap1"]);
    expect(bag.discarded).toEqual(["snap1"]);
    expect(bag.modpackUpserts).toEqual([]);
  });

  it("GET serves the pack identity and whether it can update", async () => {
    const res = await getPack(new NextRequest("http://localhost/api/servers/s1/mods/pack"), { params: Promise.resolve({ id: "s1" }) });
    const data = await res.json();
    expect(data.pack.packName).toBe("Test Pack");
    expect(data.updatable).toBe(true);
  });
});
