import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";

/**
 * Route-level guards for the mod install/uninstall/config API — the class of
 * bug fixed in #119 (installs that never record rows / uninstall field
 * mismatches) passed every lib test because the routes had zero coverage.
 * Boundary modules (auth, prisma, snapshots, sandbox, dataRoot) are mocked;
 * the ini/cfg file logic under test is real.
 */

const bag = vi.hoisted(() => ({
  dataRoot: "",
  isAdmin: true,
  access: null as any,
  findMany: [] as any[],
  findFirst: null as any,
  findUnique: null as any,
  upserts: [] as any[],
  deletes: [] as any[],
  audit: [] as any[],
  bootError: null as Error | null,
  restored: [] as string[],
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => ({ id: "user1" }) }));
vi.mock("@/lib/serverAuth", () => ({
  verifyServerAccess: async (_serverId: string, _userId: string, required?: string) => {
    if (required === "ADMIN" && !bag.isAdmin) return null;
    return bag.access;
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    get modInstallation() {
      return {
        findMany: async () => bag.findMany,
        findFirst: async () => bag.findFirst,
        findUnique: async () => bag.findUnique,
        upsert: async (args: any) => {
          bag.upserts.push(args);
          return {};
        },
        delete: async (args: any) => {
          bag.deletes.push(args);
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
    get serverSnapshot() {
      return { delete: async () => ({}) };
    },
  },
}));
vi.mock("@/lib/snapshots", () => ({
  createSnapshot: async () => ({ id: "snap1" }),
  restoreSnapshot: async (id: string) => {
    bag.restored.push(id);
  },
}));
vi.mock("@/lib/runners/sandbox", () => ({
  testServerBoot: async () => {
    if (bag.bootError) throw bag.bootError;
    return true;
  },
}));
vi.mock("@/lib/appPaths", () => ({ dataRoot: () => bag.dataRoot }));

import { POST as installMod } from "@/app/api/servers/[id]/mods/install/route";
import { DELETE as uninstallMod } from "@/app/api/servers/[id]/mods/[modId]/route";
import { GET as getConfig, POST as postConfig } from "@/app/api/servers/[id]/mods/[modId]/config/route";

let dir: string;
let iniPath: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mod-routes-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(path.join(dir, "local-servers"), { recursive: true, force: true });
  bag.dataRoot = dir;
  bag.isAdmin = true;
  bag.access = {
    server: { id: "s1", name: "Test Server", game: "Zomboid", status: "STOPPED" },
  };
  bag.findMany = [];
  bag.findFirst = null;
  bag.findUnique = null;
  bag.upserts = [];
  bag.deletes = [];
  bag.audit = [];
  bag.bootError = null;
  bag.restored = [];
  iniPath = path.join(dir, "local-servers", "s1", "zomboid-server", "zomboid-data", "Server", "servertest.ini");
});

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

describe("Zomboid install route", () => {
  it("records a ModInstallation row (both ids) and writes servertest.ini", async () => {
    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", {
        modType: "STEAM_WORKSHOP",
        modId: "BB_CommonSense",
        modName: "Common Sense",
        workshopId: "2875848298",
      }),
      { params: { id: "s1" } }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // The #119 bug: installs used to write the ini with no row at all.
    expect(bag.upserts).toHaveLength(1);
    expect(bag.upserts[0].where.serverId_provider_packageId).toEqual({
      serverId: "s1", provider: "workshop", packageId: "2875848298",
    });
    expect(bag.upserts[0].create).toMatchObject({
      provider: "workshop",
      packageId: "2875848298",
      workshopModId: "BB_CommonSense",
      name: "Common Sense",
    });

    const ini = fs.readFileSync(iniPath, "utf-8");
    expect(ini).toContain("WorkshopItems=2875848298");
    expect(ini).toContain("Mods=BB_CommonSense");
    expect(bag.audit[0]?.action).toBe("INSTALL_MOD");
  });

  it("rolls back to the pre-install snapshot when the sandbox boot fails", async () => {
    bag.bootError = new Error("Sandbox Test Failed");
    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", {
        modType: "STEAM_WORKSHOP",
        modId: "BB_CommonSense",
        workshopId: "2875848298",
      }),
      { params: { id: "s1" } }
    );
    expect(res.status).toBe(500);
    expect(bag.restored).toEqual(["snap1"]);
    expect((await res.json()).error).toContain("Safe Rollback");
  });
});

describe("Zomboid uninstall route", () => {
  it("strips the workshop ID from WorkshopItems and the mod ID from Mods, then deletes the row", async () => {
    fs.mkdirSync(path.dirname(iniPath), { recursive: true });
    fs.writeFileSync(iniPath, "WorkshopItems=111;2875848298\nMods=Foo;BB_CommonSense\nSaveEveryMin=5\n");
    bag.findFirst = {
      id: "row1", serverId: "s1", provider: "workshop",
      packageId: "2875848298", workshopModId: "BB_CommonSense", name: "Common Sense",
    };

    const res = await uninstallMod(
      jsonReq("/api/servers/s1/mods/2875848298", "DELETE"),
      { params: { id: "s1", modId: "2875848298" } }
    );
    expect(res.status).toBe(200);

    const ini = fs.readFileSync(iniPath, "utf-8");
    expect(ini).toContain("WorkshopItems=111");
    expect(ini).toContain("Mods=Foo");
    expect(ini).not.toContain("2875848298");
    expect(ini).not.toContain("BB_CommonSense");
    expect(ini).toContain("SaveEveryMin=5");

    expect(bag.deletes).toHaveLength(1);
    expect(bag.deletes[0].where.serverId_provider_packageId).toEqual({
      serverId: "s1", provider: "workshop", packageId: "2875848298",
    });
  });
});

describe("mod config route", () => {
  const cfgDir = () => path.join(dir, "local-servers", "s1", "valheim-server", "BepInEx", "config");

  function writeCfg(name: string, content: string): string {
    fs.mkdirSync(cfgDir(), { recursive: true });
    const p = path.join(cfgDir(), name);
    fs.writeFileSync(p, content);
    return p;
  }

  const sampleCfg = [
    "[General]",
    "",
    "## Crowbars can open doors.",
    "# Setting type: Boolean",
    "# Default value: true",
    "crowbarDoors = true",
    "",
    "[Building]",
    "",
    "wallHeight = 5",
    "",
  ].join("\n");

  beforeEach(() => {
    bag.access = {
      server: { id: "s1", name: "Test Server", game: "Valheim", status: "STOPPED" },
    };
    bag.findUnique = {
      id: "row1", serverId: "s1", provider: "thunderstore",
      packageId: "braven-CommonSense", name: "Common Sense",
    };
  });

  it("parses a BepInEx cfg matched by exact filename stem", async () => {
    writeCfg("CommonSense.cfg", sampleCfg);
    const res = await getConfig(
      jsonReq("/api/servers/s1/mods/row1/config", "GET"),
      { params: { id: "s1", modId: "row1" } }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.file).toBe("CommonSense.cfg");
    expect(data.sections[0]).toMatchObject({ name: "General" });
    expect(data.sections[0].properties[0]).toMatchObject({
      key: "crowbarDoors", value: "true", type: "Boolean", defaultValue: "true",
      description: "Crowbars can open doors.",
    });
  });

  it("refuses when several cfg files could belong to the mod", async () => {
    // stem "common" matches both files as a substring, neither exactly
    bag.findUnique = { ...bag.findUnique, packageId: "braven-Common" };
    writeCfg("CommonSense.cfg", sampleCfg);
    writeCfg("CommonExtra.cfg", sampleCfg);
    const res = await getConfig(
      jsonReq("/api/servers/s1/mods/row1/config", "GET"),
      { params: { id: "s1", modId: "row1" } }
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("Couldn't determine");
  });

  it("does not serve a mod row belonging to another server", async () => {
    bag.findUnique = { ...bag.findUnique, serverId: "other-server" };
    const res = await getConfig(
      jsonReq("/api/servers/s1/mods/row1/config", "GET"),
      { params: { id: "s1", modId: "row1" } }
    );
    expect(res.status).toBe(404);
  });

  it("requires ADMIN to save", async () => {
    bag.isAdmin = false;
    const res = await postConfig(
      jsonReq("/api/servers/s1/mods/row1/config", "POST", { sections: [] }),
      { params: { id: "s1", modId: "row1" } }
    );
    expect(res.status).toBe(403);
  });

  it("saves values, backs up the original, and audits UPDATE_CONFIG", async () => {
    const cfgPath = writeCfg("CommonSense.cfg", sampleCfg);
    const sections = [
      { name: "General", properties: [{ key: "crowbarDoors", value: "false", type: "Boolean", defaultValue: "true", description: "Crowbars can open doors." }] },
    ];
    const res = await postConfig(
      jsonReq("/api/servers/s1/mods/row1/config", "POST", { sections }),
      { params: { id: "s1", modId: "row1" } }
    );
    expect(res.status).toBe(200);
    const saved = fs.readFileSync(cfgPath, "utf-8");
    expect(saved).toContain("crowbarDoors = false");
    expect(fs.existsSync(`${cfgPath}.bak`)).toBe(true);
    expect(bag.audit[0]?.action).toBe("UPDATE_CONFIG");
  });

  it("rejects values containing newlines (cfg line injection)", async () => {
    const cfgPath = writeCfg("CommonSense.cfg", sampleCfg);
    const before = fs.readFileSync(cfgPath, "utf-8");
    const sections = [
      { name: "General", properties: [{ key: "crowbarDoors", value: "true\nwallHeight = 99", type: "Boolean" }] },
    ];
    const res = await postConfig(
      jsonReq("/api/servers/s1/mods/row1/config", "POST", { sections }),
      { params: { id: "s1", modId: "row1" } }
    );
    expect(res.status).toBe(400);
    expect(fs.readFileSync(cfgPath, "utf-8")).toBe(before);
  });
});
