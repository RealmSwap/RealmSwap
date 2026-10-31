import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { NextRequest } from "next/server";

/**
 * The install-pack route end to end, both gallery providers:
 *  - CurseForge (the pre-existing branch, provider omitted for back-compat):
 *    newest pack file resolved via the canned API, downloaded, applied.
 *  - Modrinth (the gallery addition): newest version resolved, its .mrpack
 *    downloaded, and the SAME plan → apply pipeline runs (planModpackFromZip
 *    dispatches on the archive shape, so no second pipeline exists).
 * Everything network-shaped runs through a stubbed global fetch; pack
 * planning, hash verification and file work are all real.
 */

const bag = vi.hoisted(() => ({
  dataRoot: "",
  access: null as any,
  installedModpack: null as any,
  modpackUpserts: [] as any[],
  upserts: [] as any[],
  audit: [] as any[],
  bootError: null as Error | null,
  restored: [] as string[],
  discarded: [] as string[],
  downloadBodies: null as null | ((url: string) => Buffer | null),
  fetchRoutes: null as null | ((url: string, init?: RequestInit) => Response | Promise<Response>),
}));

vi.mock("@/lib/download", () => {
  const downloadBody = async (url: string, dest: string) => {
    const body = bag.downloadBodies?.(url);
    if (!body) throw new Error(`no download body stubbed for ${url}`);
    fs.writeFileSync(dest, body);
  };
  return { downloadFile: downloadBody, downloadFileWithRetry: downloadBody };
});
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
        deleteMany: async () => ({}),
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

import { POST as installPack } from "@/app/api/servers/[id]/mods/install-pack/route";

let dir: string;
const sha1 = (buf: Buffer) => crypto.createHash("sha1").update(buf).digest("hex");

const MRPROJECT = "a1b2c3d4-1111-2222-3333-444455556666";
const jarBody = Buffer.from("gallery-pack-mod bytes");

// A minimal but real .mrpack: one required server-side jar, no loader pin,
// no overrides. Same Minecraft version as the canned server (no mcSwitch).
const mrpackZip = () => {
  const zip = new AdmZip();
  zip.addFile(
    "modrinth.index.json",
    Buffer.from(JSON.stringify({
      formatVersion: 1,
      game: "minecraft",
      versionId: "1.0.0",
      name: "Gallery Pack",
      dependencies: { minecraft: "1.20.1" },
      files: [
        {
          path: "mods/simple.jar",
          hashes: { sha1: sha1(jarBody) },
          env: { client: "required", server: "required" },
          downloads: ["https://cdn.modrinth.com/data/AAAA/versions/1.0.0/simple.jar"],
          fileSize: jarBody.length,
        },
      ],
    }))
  );
  return zip;
};

const MRPACK_URL = "https://cdn.modrinth.com/data/AAAA/versions/1.0.0/Gallery-Pack-1.0.0.mrpack";
const JAR_URL = "https://cdn.modrinth.com/data/AAAA/versions/1.0.0/simple.jar";

const modrinthFetchStub = (fileEntries: unknown[]) => async (url: string) => {
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
  if (url === `https://api.modrinth.com/v2/project/${MRPROJECT}/version`) return json(fileEntries);
  return new Response("unrouted", { status: 404 });
};

// CurseForge back-compat fixture, mirroring the update-pack harness: the
// pack's own file listing (newest = 20) + the referenced mod files.
const cfJar = Buffer.from("cf-pack-mod bytes");
const cfFile = (id: number, modId: number, displayName: string, fileName: string, body: Buffer) => ({
  id, modId, displayName, fileName,
  isAvailable: true, isAlternate: false,
  gameVersions: ["1.20.1"],
  downloadUrl: null,
  hashes: [{ algo: 1, value: sha1(body) }],
});
const cfListing = [
  { id: 20, modId: 900, displayName: "CF Pack 1.0", fileName: "cfpack-1.0.zip",
    isAvailable: true, isAlternate: false, gameVersions: ["1.20.1"], downloadUrl: null, hashes: [] },
];
const cfPackZip = () => {
  const zip = new AdmZip();
  zip.addFile(
    "manifest.json",
    Buffer.from(JSON.stringify({
      manifestType: "minecraftModpack", manifestVersion: 1,
      name: "CF Pack", version: "1.0",
      minecraft: { version: "1.20.1" },
      files: [{ projectID: 321, fileID: 3210, required: true }],
    }))
  );
  return zip;
};
const cfFetchStub = () => async (url: string, init?: RequestInit) => {
  const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
  if (url.startsWith("https://api.curseforge.com/v1/mods/900/files")) return json(cfListing);
  if (url === "https://api.curseforge.com/v1/mods/files") {
    const bodyIds: number[] = JSON.parse(String(init?.body)).fileIds;
    return json([cfFile(3210, 321, "CF Mod", "cfmod-1.0.jar", cfJar)].filter((f) => bodyIds.includes(f.id)));
  }
  if (url === "https://api.curseforge.com/v1/mods") {
    return json([{ id: 321, name: "CF Mod" }]);
  }
  return new Response("unrouted", { status: 404 });
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "install-pack-test-"));
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
  bag.audit = [];
  bag.bootError = null;
  bag.restored = [];
  bag.discarded = [];
  bag.downloadBodies = (url) => {
    if (url === MRPACK_URL) return mrpackZip().toBuffer();
    if (url === JAR_URL) return jarBody;
    if (url.includes("cfpack-1.0.zip")) return cfPackZip().toBuffer();
    if (url.includes("cfmod-1.0.jar")) return cfJar;
    return null;
  };
  bag.fetchRoutes = modrinthFetchStub([
    {
      version_number: "1.0.0",
      game_versions: ["1.20.1"],
      loaders: [],
      files: [{ url: MRPACK_URL, filename: "Gallery-Pack-1.0.0.mrpack", primary: true, hashes: {} }],
    },
  ]);
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => bag.fetchRoutes!(url, init));
  process.env.CURSEFORGE_API_KEY = "test-key";

  const serverRoot = path.join(dir, "local-servers", "s1");
  fs.mkdirSync(serverRoot, { recursive: true });
  const serverJar = new AdmZip();
  serverJar.addFile("version.json", Buffer.from(JSON.stringify({ id: "1.20.1" })));
  fs.writeFileSync(path.join(serverRoot, "server.jar"), serverJar.toBuffer());

  bag.installedModpack = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CURSEFORGE_API_KEY;
});

function post(body: unknown, url = "/api/servers/s1/mods/install-pack") {
  return installPack(
    new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "s1" }) }
  );
}

describe("install-pack route", () => {
  it("installs a Modrinth gallery pack through the shared plan→apply pipeline", async () => {
    const res = await post({ provider: "modrinth", projectId: MRPROJECT });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // The pack row records the Modrinth identity (fileId is CF-only).
    expect(bag.modpackUpserts).toHaveLength(1);
    expect(bag.modpackUpserts[0].create).toMatchObject({
      serverId: "s1",
      kind: "mrpack",
      projectId: MRPROJECT,
      packName: "Gallery Pack",
      version: "1.0.0",
      mcVersion: "1.20.1",
    });
    // The pack's server-side file landed on disk, and the boot test ran.
    expect(fs.existsSync(path.join(dir, "local-servers", "s1", "mods", "simple.jar"))).toBe(true);
    expect(bag.audit.some((a: any) => a.action === "INSTALL_MODPACK")).toBe(true);
    expect(bag.restored).toHaveLength(0);
  });

  it("refuses a Modrinth project whose newest file is not an installable .mrpack", async () => {
    bag.fetchRoutes = modrinthFetchStub([
      {
        version_number: "2.0.0",
        game_versions: ["1.20.1"],
        loaders: [],
        files: [{ url: "https://cdn.modrinth.com/data/AAAA/versions/2.0.0/notapack.jar", filename: "notapack.jar", primary: true, hashes: {} }],
      },
    ]);

    const res = await post({ provider: "modrinth", projectId: MRPROJECT });
    expect(res.status).toBe(400);
    expect(bag.modpackUpserts).toHaveLength(0);
  });

  it("400s a Modrinth id that is not a UUID instead of leaking it to the API", async () => {
    const res = await post({ provider: "modrinth", projectId: "999" });
    expect(res.status).toBe(400);
  });

  it("still installs CurseForge packs when provider is omitted (back-compat)", async () => {
    bag.fetchRoutes = cfFetchStub();
    const res = await post({ projectId: "900" });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(bag.modpackUpserts[0].create).toMatchObject({
      kind: "curseforge",
      projectId: "900",
      fileId: 20,
      fileName: "cfpack-1.0.zip",
    });
  });

  it("rejects a CurseForge-shaped numeric id when provider is modrinth — and vice versa", async () => {
    bag.fetchRoutes = cfFetchStub();
    const res = await post({ projectId: "900" });
    // Provider defaults to curseforge, so the numeric id above is valid; a
    // numeric id under the modrinth provider is what must be refused.
    expect(res.status).toBe(200);

    const wrong = await post({ provider: "modrinth", projectId: "900" });
    expect(wrong.status).toBe(400);
  });
});
