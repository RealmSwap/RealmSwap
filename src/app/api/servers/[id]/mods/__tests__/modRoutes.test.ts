import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
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
  discarded: [] as string[],
  // Per-test download bodies (URL → bytes); null falls through to real HTTPS.
  downloadBody: null as null | ((url: string) => Buffer | null),
  umodCalls: [] as any[],
  installedModpack: null as any,
  modpackUpserts: [] as any[],
  deleteMany: [] as any[],
}));

vi.mock("@/lib/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/download")>();
  return {
    downloadFile: async (url: string, dest: string) => {
      const body = bag.downloadBody?.(url);
      if (body) {
        fs.writeFileSync(dest, body);
        return;
      }
      return actual.downloadFile(url, dest);
    },
  };
});

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => ({ id: "user1" }) }));
vi.mock("@/lib/serverAuth", () => ({
  verifyServerAccess: async (_serverId: string, _userId: string, required?: string) => {
    if (required === "ADMIN" && !bag.isAdmin) return null;
    return bag.access;
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
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
        deleteMany: async (args: any) => {
          bag.deleteMany.push(args);
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
  hasRealBootTest: (game: string) =>
    ["MINECRAFT", "VALHEIM", "ZOMBOID", "TERRARIA"].includes(game.toUpperCase()),
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

import { POST as installMod } from "@/app/api/servers/[id]/mods/install/route";
import { SandboxBootError } from "@/lib/runners/sandbox";
import { DELETE as uninstallMod } from "@/app/api/servers/[id]/mods/[modId]/route";
import { GET as getConfig, POST as postConfig } from "@/app/api/servers/[id]/mods/[modId]/config/route";
import { POST as importCollection } from "@/app/api/servers/[id]/mods/import/route";


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
  bag.discarded = [];
  bag.umodCalls = [];
  bag.installedModpack = null;
  bag.modpackUpserts = [];
  bag.deleteMany = [];
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
    // The route refuses installs before the server itself exists.
    fs.mkdirSync(path.join(dir, "local-servers", "s1", "zomboid-server"), { recursive: true });
    fs.writeFileSync(path.join(dir, "local-servers", "s1", "zomboid-server", "StartServer64.bat"), "@echo off");
    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", {
        modType: "STEAM_WORKSHOP",
        modId: "BB_CommonSense",
        modName: "Common Sense",
        workshopId: "2875848298",
      }),
      { params: Promise.resolve({ id: "s1" }) }
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
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(500);
    expect(bag.restored).toEqual(["snap1"]);
    expect((await res.json()).error).toContain("Safe Rollback");
  });

  it("includes the sandbox boot output when the boot failure carries it", async () => {
    bag.bootError = new SandboxBootError("Server crashed immediately with exit code 1.", "--- stderr ---\nFATAL");
    fs.mkdirSync(path.join(dir, "local-servers", "s1", "zomboid-server"), { recursive: true });
    fs.writeFileSync(path.join(dir, "local-servers", "s1", "zomboid-server", "StartServer64.bat"), "@echo off");
    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", {
        modType: "STEAM_WORKSHOP",
        modId: "BB_CommonSense",
        workshopId: "2875848298",
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("exit code 1");
    expect(data.bootOutput).toContain("FATAL");
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
      { params: Promise.resolve({ id: "s1", modId: "2875848298" }) }
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

describe("ARK install + uninstall route", () => {
  const arkIniPath = () =>
    path.join(dir, "local-servers", "s1", "ark-server", "ShooterGame", "Saved", "Config", "WindowsServer", "GameUserSettings.ini");

  beforeEach(() => {
    bag.access = {
      server: { id: "s1", name: "ARK Server", game: "ARK", status: "STOPPED" },
    };
  });

  it("appends the workshop id to ActiveMods= and records the row", async () => {
    // The route refuses installs before the server itself exists.
    fs.mkdirSync(path.join(dir, "local-servers", "s1", "ark-server", "ShooterGame"), { recursive: true });
    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", {
        modType: "STEAM_WORKSHOP",
        modName: "Structures Plus (S+)",
        workshopId: "731604991",
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(200);
    expect(fs.readFileSync(arkIniPath(), "utf-8")).toContain("ActiveMods=731604991");
    expect(bag.upserts[0].create).toMatchObject({
      provider: "workshop",
      packageId: "731604991",
    });
    // Single id space — no workshopModId for ARK.
    expect(bag.upserts[0].create).not.toHaveProperty("workshopModId");
    expect(bag.audit[0]?.action).toBe("INSTALL_MOD");
  });

  it("removes the workshop id from ActiveMods= on uninstall", async () => {
    fs.mkdirSync(path.dirname(arkIniPath()), { recursive: true });
    fs.writeFileSync(arkIniPath(), "[ServerSettings]\nActiveMods=731604991,1404697612\n");
    bag.findFirst = {
      id: "row1", serverId: "s1", provider: "workshop",
      packageId: "731604991", workshopModId: null, name: "S+",
    };

    const res = await uninstallMod(
      jsonReq("/api/servers/s1/mods/731604991", "DELETE"),
      { params: Promise.resolve({ id: "s1", modId: "731604991" }) }
    );
    expect(res.status).toBe(200);
    expect(fs.readFileSync(arkIniPath(), "utf-8")).toContain("ActiveMods=1404697612");
    expect(bag.deletes[0].where.serverId_provider_packageId).toEqual({
      serverId: "s1", provider: "workshop", packageId: "731604991",
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
      { params: Promise.resolve({ id: "s1", modId: "row1" }) }
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
      { params: Promise.resolve({ id: "s1", modId: "row1" }) }
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("Couldn't determine");
  });

  it("does not serve a mod row belonging to another server", async () => {
    bag.findUnique = { ...bag.findUnique, serverId: "other-server" };
    const res = await getConfig(
      jsonReq("/api/servers/s1/mods/row1/config", "GET"),
      { params: Promise.resolve({ id: "s1", modId: "row1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("requires ADMIN to save", async () => {
    bag.isAdmin = false;
    const res = await postConfig(
      jsonReq("/api/servers/s1/mods/row1/config", "POST", { sections: [] }),
      { params: Promise.resolve({ id: "s1", modId: "row1" }) }
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
      { params: Promise.resolve({ id: "s1", modId: "row1" }) }
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
      { params: Promise.resolve({ id: "s1", modId: "row1" }) }
    );
    expect(res.status).toBe(400);
    expect(fs.readFileSync(cfgPath, "utf-8")).toBe(before);
  });
});

/** Small in-test zip builder for download bodies the installers extract. */
function zipFor(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

describe("VRISING install + uninstall route", () => {
  const vrDir = () => path.join(dir, "local-servers", "s1", "vrising-server");

  beforeEach(() => {
    bag.access = { server: { id: "s1", name: "V Server", game: "VRISING", status: "STOPPED" } };
    bag.downloadBody = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    bag.downloadBody = null;
  });

  function stubThunderstoreIndex() {
    const index = [
      {
        full_name: "BepInEx-BepInExPack_V_Rising", name: "BepInExPack_V_Rising", owner: "BepInEx",
        is_deprecated: false, rating_score: 50, date_updated: "", categories: [],
        versions: [{ version_number: "1.733.2", download_url: "https://ts/core.zip", dependencies: [], description: "", icon: "" }],
      },
      {
        full_name: "deca-VampireCommandFramework", name: "VampireCommandFramework", owner: "deca",
        is_deprecated: false, rating_score: 22, date_updated: "", categories: [],
        versions: [{ version_number: "0.9.0", download_url: "https://ts/vcf.zip", dependencies: [], description: "", icon: "" }],
      },
      {
        full_name: "team-CoolMod", name: "CoolMod", owner: "team",
        is_deprecated: false, rating_score: 10, date_updated: "", categories: [],
        versions: [{ version_number: "1.0.0", download_url: "https://ts/coolmod.zip", dependencies: ["deca-VampireCommandFramework-0.9.0"], description: "", icon: "" }],
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      if (String(url).includes("/api/v1/package/")) {
        return { ok: true, json: async () => index };
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    bag.downloadBody = (url) => {
      if (url === "https://ts/core.zip") {
        return zipFor({
          "BepInExPack_V_Rising/doorstop_config.ini": "[doorstop]",
          "BepInExPack_V_Rising/BepInEx/core/BepInEx.Core.dll": "core",
        });
      }
      if (url === "https://ts/vcf.zip") return zipFor({ "VampireCommandFramework.dll": "vcf" });
      if (url === "https://ts/coolmod.zip") return zipFor({ "CoolMod.dll": "mod" });
      return null;
    };
  }

  it("installs a plugin with its dependency and auto-provisions the IL2CPP BepInEx core pack", async () => {
    fs.mkdirSync(vrDir(), { recursive: true });
    stubThunderstoreIndex();

    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", {
        modType: "THUNDERSTORE", modId: "team-CoolMod", modName: "CoolMod",
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    expect(res.status).toBe(200);
    expect((await res.json()).dependencyCount).toBe(1);
    // Core pack wrapper folder is stripped onto the server root
    expect(fs.readFileSync(path.join(vrDir(), "doorstop_config.ini"), "utf-8")).toBe("[doorstop]");
    // Content packages land in per-package plugin folders
    expect(fs.existsSync(path.join(vrDir(), "BepInEx", "plugins", "deca-VampireCommandFramework", "VampireCommandFramework.dll"))).toBe(true);
    expect(fs.existsSync(path.join(vrDir(), "BepInEx", "plugins", "team-CoolMod", "CoolMod.dll"))).toBe(true);
    // Rows: core, dependency, main — real versions
    expect(bag.upserts.map((u) => u.create.packageId)).toEqual([
      "BepInEx-BepInExPack_V_Rising",
      "deca-VampireCommandFramework",
      "team-CoolMod",
    ]);
    expect(bag.upserts[2].create.version).toBe("1.0.0");
    expect(bag.audit[0]?.action).toBe("INSTALL_MOD");
  });

  it("routes a directly-requested core pack to the server root, not plugins/", async () => {
    fs.mkdirSync(vrDir(), { recursive: true });
    stubThunderstoreIndex();

    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", {
        modType: "THUNDERSTORE", modId: "BepInEx-BepInExPack_V_Rising",
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(vrDir(), "doorstop_config.ini"))).toBe(true);
    expect(fs.existsSync(path.join(vrDir(), "BepInEx", "plugins", "BepInEx-BepInExPack_V_Rising"))).toBe(false);
    expect(bag.upserts[0].create).toMatchObject({
      provider: "thunderstore",
      packageId: "BepInEx-BepInExPack_V_Rising",
      version: "1.733.2",
    });
  });

  it("removes the package folder on uninstall", async () => {
    fs.mkdirSync(path.join(vrDir(), "BepInEx", "plugins", "team-CoolMod"), { recursive: true });
    fs.writeFileSync(path.join(vrDir(), "BepInEx", "plugins", "team-CoolMod", "CoolMod.dll"), "mod");
    bag.findFirst = {
      id: "row1", serverId: "s1", provider: "thunderstore", packageId: "team-CoolMod", name: "CoolMod",
    };

    const res = await uninstallMod(
      jsonReq("/api/servers/s1/mods/team-CoolMod", "DELETE"),
      { params: Promise.resolve({ id: "s1", modId: "team-CoolMod" }) }
    );

    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(vrDir(), "BepInEx", "plugins", "team-CoolMod"))).toBe(false);
    expect(bag.deletes[0].where.serverId_provider_packageId).toEqual({
      serverId: "s1", provider: "thunderstore", packageId: "team-CoolMod",
    });
  });
});

describe("RUST install + uninstall route", () => {
  const rustDir = () => path.join(dir, "local-servers", "s1", "rust-server");

  beforeEach(() => {
    bag.access = { server: { id: "s1", name: "Rust Server", game: "RUST", status: "STOPPED" } };
    bag.downloadBody = null;
  });
  afterEach(() => {
    bag.downloadBody = null;
  });

  it("installs a plugin and auto-provisions the Oxide framework", async () => {
    fs.mkdirSync(rustDir(), { recursive: true });
    bag.downloadBody = (url) => {
      if (url === "https://umod.org/games/rust/download") {
        return zipFor({
          "RustDedicated_Data/Managed/Oxide.Core.dll": "oxide",
          "RustDedicated_Data/Managed/Oxide.Common.dll": "oxide2",
        });
      }
      if (url === "https://umod.org/plugins/Kits.cs") return Buffer.from("void Init() {}");
      return null;
    };

    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", {
        modType: "UMOD", modId: "Kits", modName: "Rust Kits", version: "4.4.10",
        downloadUrl: "https://umod.org/plugins/Kits.cs",
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(rustDir(), "Oxide", "plugins", "Kits.cs"), "utf-8")).toBe("void Init() {}");
    expect(fs.existsSync(path.join(rustDir(), "RustDedicated_Data", "Managed", "Oxide.Core.dll"))).toBe(true);
    // Rows: Oxide framework, then the plugin with the pinned version
    expect(bag.upserts.map((u) => u.create.packageId)).toEqual(["Oxide", "Kits"]);
    expect(bag.upserts[1].create).toMatchObject({
      provider: "umod", packageId: "Kits", version: "4.4.10", name: "Rust Kits",
    });
    expect(bag.audit[0]?.action).toBe("INSTALL_MOD");
  });

  it("installs the Oxide framework alone for the theme card (no modId)", async () => {
    fs.mkdirSync(rustDir(), { recursive: true });
    bag.downloadBody = (url) =>
      url === "https://umod.org/games/rust/download"
        ? zipFor({ "RustDedicated_Data/Managed/Oxide.Core.dll": "oxide" })
        : null;

    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", { modType: "UMOD", modName: "Oxide/uMod Framework" }),
      { params: Promise.resolve({ id: "s1" }) }
    );

    expect(res.status).toBe(200);
    expect(bag.upserts).toHaveLength(1);
    expect(bag.upserts[0].create).toMatchObject({ provider: "umod", packageId: "Oxide" });
    expect(fs.existsSync(path.join(rustDir(), "Oxide", "plugins"))).toBe(true);
  });

  it("removes the plugin .cs on uninstall", async () => {
    fs.mkdirSync(path.join(rustDir(), "Oxide", "plugins"), { recursive: true });
    fs.writeFileSync(path.join(rustDir(), "Oxide", "plugins", "Kits.cs"), "void Init() {}");
    bag.findFirst = {
      id: "row1", serverId: "s1", provider: "umod", packageId: "Kits", name: "Rust Kits",
    };

    const res = await uninstallMod(
      jsonReq("/api/servers/s1/mods/Kits", "DELETE"),
      { params: Promise.resolve({ id: "s1", modId: "Kits" }) }
    );

    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(rustDir(), "Oxide", "plugins", "Kits.cs"))).toBe(false);
  });
});

describe("ARK collection import", () => {
  it("replays ActiveMods entries and records rows (engine re-downloads at boot)", async () => {
    bag.access = { server: { id: "s1", name: "ARK", game: "ARK", status: "STOPPED" } };
    fs.mkdirSync(path.join(dir, "local-servers", "s1", "ark-server"), { recursive: true });
    const collection = {
      name: "ARK pack", game: "ARK",
      mods: [
        { provider: "workshop", packageId: "931590842", name: "Super Structures", version: "Workshop" },
        { provider: "workshop", packageId: "895711207", name: "Classic Flyers", version: "Workshop" },
      ],
    };
    const form = new FormData();
    form.append("collection", new Blob([JSON.stringify(collection)], { type: "application/json" }), "c.json");
    const req = new NextRequest("http://localhost/api/servers/s1/mods/import", { method: "POST", body: form });
    const res = await importCollection(req, { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(200);
    const ini = fs.readFileSync(
      path.join(dir, "local-servers", "s1", "ark-server", "ShooterGame", "Saved", "Config", "WindowsServer", "GameUserSettings.ini"),
      "utf-8"
    );
    expect(ini).toContain("ActiveMods=931590842,895711207");
    expect(bag.upserts).toHaveLength(2);
    expect(bag.upserts[0].where.serverId_provider_packageId).toEqual({
      serverId: "s1", provider: "workshop", packageId: "931590842",
    });
    expect(bag.audit[0].action).toBe("IMPORT_MODS");
  });

  it("refuses collections for a different game before snapshotting", async () => {
    bag.access = { server: { id: "s1", name: "ARK", game: "ARK", status: "STOPPED" } };
    const collection = { game: "RUST", mods: [{ provider: "umod", packageId: "Kits" }] };
    const form = new FormData();
    form.append("collection", new Blob([JSON.stringify(collection)]), "c.json");
    const res = await importCollection(
      new NextRequest("http://localhost/api/servers/s1/mods/import", { method: "POST", body: form }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("Rust collection import", () => {
  it("reinstalls plugins by name and replays the Oxide core row", async () => {
    bag.access = { server: { id: "s1", name: "Rust", game: "RUST", status: "STOPPED" } };
    fs.mkdirSync(path.join(dir, "local-servers", "s1", "rust-server", "RustDedicated_Data"), { recursive: true });
    // Offline: metadata 429s (installer warns + falls back to the derived
    // URL), the Oxide zip and plugin .cs come from the download bag.
    vi.stubGlobal("fetch", async () => new Response("slow down", { status: 429 }));
    bag.downloadBody = (url) => {
      if (url === "https://umod.org/games/rust/download") {
        const zip = new AdmZip();
        zip.addFile("RustDedicated_Data/Managed/Oxide.Core.dll", Buffer.from("oxide"));
        return zip.toBuffer();
      }
      if (url === "https://umod.org/plugins/Kits.cs") return Buffer.from("// Kits");
      return null;
    };
    const collection = {
      name: "Rust pack", game: "RUST",
      mods: [
        { provider: "umod", packageId: "Oxide", name: "Oxide/uMod framework", version: "release" },
        { provider: "umod", packageId: "Kits", name: "Kits", version: "4.4.10" },
      ],
    };
    const form = new FormData();
    form.append("collection", new Blob([JSON.stringify(collection)]), "c.json");
    const res = await importCollection(
      new NextRequest("http://localhost/api/servers/s1/mods/import", { method: "POST", body: form }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.warnings.join(" ")).toContain("Kits");
    // Rows: the core replay + the plugin reinstalled from the metadata-less fallback.
    const core = bag.upserts.find((u) => u.where.serverId_provider_packageId?.packageId === "Oxide");
    const plugin = bag.upserts.find((u) => u.where.serverId_provider_packageId?.packageId === "Kits");
    expect(core).toBeTruthy();
    expect(plugin.create).toMatchObject({ packageId: "Kits" });
    expect(fs.existsSync(path.join(dir, "local-servers", "s1", "rust-server", "Oxide", "plugins", "Kits.cs"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("refuses non-uMod providers loudly", async () => {
    bag.access = { server: { id: "s1", name: "Rust", game: "RUST", status: "STOPPED" } };
    fs.mkdirSync(path.join(dir, "local-servers", "s1", "rust-server", "RustDedicated_Data"), { recursive: true });
    const collection = { game: "RUST", mods: [{ provider: "thunderstore", packageId: "x-y" }] };
    const form = new FormData();
    form.append("collection", new Blob([JSON.stringify(collection)]), "c.json");
    const res = await importCollection(
      new NextRequest("http://localhost/api/servers/s1/mods/import", { method: "POST", body: form }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/Rollback completed.*Rust doesn't support/);
  });
});

describe("Minecraft TOML config route", () => {
  it("finds the config via the jar's mods.toml modId and saves line-preserving edits", async () => {
    bag.access = { server: { id: "s1", name: "MC", game: "MINECRAFT", status: "STOPPED" } };
    const serverRoot = path.join(dir, "local-servers", "s1");
    // A real jar carrying META-INF/mods.toml (curseforge rows key on the numeric project id)
    const jar = new AdmZip();
    jar.addFile("META-INF/mods.toml", Buffer.from('modId="mymod"\nversion="1.0"'));
    fs.mkdirSync(path.join(serverRoot, "mods"), { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "mods", "123456.jar"), jar.toBuffer());
    fs.mkdirSync(path.join(serverRoot, "config"), { recursive: true });
    const tomlPath = path.join(serverRoot, "config", "mymod.toml");
    fs.writeFileSync(tomlPath, '[general]\n# Chat logging\nlogToChat = true\n');

    bag.findUnique = { id: "row1", serverId: "s1", provider: "curseforge", packageId: "123456", name: "My Mod" };

    const getRes = await getConfig(
      new NextRequest("http://localhost/api/servers/s1/mods/row1/config"),
      { params: Promise.resolve({ id: "s1", modId: "row1" }) }
    );
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.file).toBe("mymod.toml");
    expect(data.format).toBe("toml");
    expect(data.sections[0].properties[0]).toMatchObject({ key: "logToChat", value: "true", type: "Boolean" });

    const postRes = await postConfig(
      jsonReq("/api/servers/s1/mods/row1/config", "POST", {
        sections: [{ name: "general", properties: [{ key: "logToChat", value: "false", type: "Boolean", defaultValue: "", description: "" }] }],
      }),
      { params: Promise.resolve({ id: "s1", modId: "row1" }) }
    );
    expect(postRes.status).toBe(200);
    const saved = fs.readFileSync(tomlPath, "utf-8");
    expect(saved).toContain("logToChat = false");
    expect(saved).toContain("# Chat logging");
    expect(fs.existsSync(`${tomlPath}.bak`)).toBe(true);
  });
});

describe("Rust JSON config route", () => {
  it("serves and saves an Oxide plugin's config/<Plugin>.json", async () => {
    bag.access = { server: { id: "s1", name: "Rust", game: "RUST", status: "STOPPED" } };
    const cfgDir = path.join(dir, "local-servers", "s1", "rust-server", "Oxide", "config");
    fs.mkdirSync(cfgDir, { recursive: true });
    const jsonPath = path.join(cfgDir, "Kits.json");
    fs.writeFileSync(jsonPath, JSON.stringify({ Max: 5, Enabled: true }));

    bag.findUnique = { id: "row2", serverId: "s1", provider: "umod", packageId: "Kits", name: "Kits" };

    const getRes = await getConfig(
      new NextRequest("http://localhost/api/servers/s1/mods/row2/config"),
      { params: Promise.resolve({ id: "s1", modId: "row2" }) }
    );
    const data = await getRes.json();
    expect(data.format).toBe("json");
    expect(data.sections[0].properties.map((p: any) => p.key)).toEqual(["Max", "Enabled"]);

    const postRes = await postConfig(
      jsonReq("/api/servers/s1/mods/row2/config", "POST", {
        sections: [{ name: "Kits.json", properties: [
          { key: "Max", value: "10", type: "Int32", defaultValue: "", description: "" },
          { key: "Enabled", value: "false", type: "Boolean", defaultValue: "", description: "" },
        ] }],
      }),
      { params: Promise.resolve({ id: "s1", modId: "row2" }) }
    );
    expect(postRes.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(jsonPath, "utf-8"))).toEqual({ Max: 10, Enabled: false });
  });
});

// ─── Satisfactory (ficsit.app) ──────────────────────────────────────────────
// The ficsit GraphQL + downloads are stubbed offline; the real installer
// pipeline (SML provisioning, zip extraction, .smm marker, rows) runs.
// getMod answers with the ASKED id and reference lookups with the ASKED
// references — static payloads would make SML resolution return mod data and
// recurse forever. Values are the { getMod: … } envelopes ficsitGraphQL unwraps.
const FICSIT_SML_GETMOD = {
  getMod: {
    id: "smlid123", name: "Satisfactory Mod Loader", mod_reference: "SML",
    latestVersions: { release: { ver: "3.12.0", hash: "c".repeat(64), targets: [{ targetName: "WindowsServer", link: "/v1/version/smlv1/WindowsServer/download" }], dependencies: [] } },
    pinned: { ver: "3.12.0", hash: "c".repeat(64), targets: [{ targetName: "WindowsServer", link: "/v1/version/smlv1/WindowsServer/download" }], dependencies: [] },
  },
};
const FICSIT_MOD_GETMOD = {
  getMod: {
    id: "modid456", name: "Nuke Rebar", mod_reference: "NukeRebar",
    latestVersions: { release: { ver: "1.2.0", hash: "d".repeat(64), targets: [{ targetName: "WindowsServer", link: "/v1/version/modv1/WindowsServer/download" }], dependencies: [] } },
    pinned: { ver: "1.2.0", hash: "d".repeat(64), targets: [{ targetName: "WindowsServer", link: "/v1/version/modv1/WindowsServer/download" }], dependencies: [] },
  },
};

const FICSIT_GRAPHQL = (getModById: Record<string, unknown>) =>
  async (url: string, init?: RequestInit) => {
    if (url !== "https://api.ficsit.app/v2/query") return new Response("nope", { status: 404 });
    const body = JSON.parse(String(init?.body));
    const q: string = body.query;
    if (Array.isArray(body.variables?.filter?.references)) {
      const refs: string[] = body.variables.filter.references;
      const byRef: Record<string, unknown> = { SML: FICSIT_SML_GETMOD, NukeRebar: FICSIT_MOD_GETMOD };
      const mods = refs.map((ref: string) => (byRef[ref] ? { ...(byRef[ref] as any).getMod, latestVersions: { release: { ver: (byRef[ref] as any).getMod.latestVersions.release.ver } } } : null)).filter(Boolean);
      return new Response(JSON.stringify({ data: { getMods: { mods } } }), { status: 200 });
    }
    const envelope = getModById[String(body.variables?.id ?? "")];
    if (envelope) return new Response(JSON.stringify({ data: envelope }), { status: 200 });
    return new Response(JSON.stringify({ data: { getMod: null } }), { status: 200 });
  };

describe("SATISFACTORY install route", () => {
  it("installs SML from the theme card (no modId) and records the ficsit row", async () => {
    bag.access = { server: { id: "s1", name: "Factory", game: "SATISFACTORY", status: "STOPPED" } };
    const serverDir = path.join(dir, "local-servers", "s1", "satisfactory-server");
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, "FactoryServer.exe"), "exe");
    vi.stubGlobal("fetch", FICSIT_GRAPHQL({ smlid123: FICSIT_SML_GETMOD }));
    bag.downloadBody = (url) => {
      if (url === "https://api.ficsit.app/v1/version/smlv1/WindowsServer/download") {
        const zip = new AdmZip();
        zip.addFile("SML.uplugin", Buffer.from(""));
        zip.addFile("Binaries/Win64/FactoryServer-SML-Win64-Shipping.dll", Buffer.from("x"));
        return zip.toBuffer();
      }
      return null;
    };

    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", { modType: "FICSIT" }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(serverDir, "FactoryGame", "Mods", "SML", "SML.uplugin"))).toBe(true);
    const row = bag.upserts.find((u) => u.where.serverId_provider_packageId?.packageId === "SML");
    expect(row.create).toMatchObject({ provider: "ficsit", packageId: "SML", version: "3.12.0" });
    vi.unstubAllGlobals();
  });

  it("refuses installs when the server is not installed yet", async () => {
    bag.access = { server: { id: "s1", name: "Factory", game: "SATISFACTORY", status: "STOPPED" } };
    const res = await installMod(
      jsonReq("/api/servers/s1/mods/install", "POST", { modType: "FICSIT", modId: "whatever" }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/not installed yet/);
  });
});

describe("SATISFACTORY collection import", () => {
  it("reinstalls a mod by reference with its pinned version", async () => {
    bag.access = { server: { id: "s1", name: "Factory", game: "SATISFACTORY", status: "STOPPED" } };
    const serverDir = path.join(dir, "local-servers", "s1", "satisfactory-server");
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, "FactoryServer.exe"), "exe");
    vi.stubGlobal("fetch", FICSIT_GRAPHQL({ smlid123: FICSIT_SML_GETMOD, modid456: FICSIT_MOD_GETMOD }));
    bag.downloadBody = (url) => {
      if (url === "https://api.ficsit.app/v1/version/modv1/WindowsServer/download") {
        const zip = new AdmZip();
        zip.addFile("NukeRebar.uplugin", Buffer.from(""));
        return zip.toBuffer();
      }
      if (url === "https://api.ficsit.app/v1/version/smlv1/WindowsServer/download") {
        const zip = new AdmZip();
        zip.addFile("SML.uplugin", Buffer.from(""));
        return zip.toBuffer();
      }
      return null;
    };

    const collection = {
      name: "Factory pack", game: "SATISFACTORY",
      mods: [{ provider: "ficsit", packageId: "NukeRebar", name: "Nuke Rebar", version: "1.2.0" }],
    };
    const form = new FormData();
    form.append("collection", new Blob([JSON.stringify(collection)]), "c.json");
    const res = await importCollection(
      new NextRequest("http://localhost/api/servers/s1/mods/import", { method: "POST", body: form }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(serverDir, "FactoryGame", "Mods", "NukeRebar", "NukeRebar.uplugin"))).toBe(true);
    // SML auto-provisioned + the mod row pinned to the collection's version.
    const sml = bag.upserts.find((u) => u.where.serverId_provider_packageId?.packageId === "SML");
    const mod = bag.upserts.find((u) => u.where.serverId_provider_packageId?.packageId === "NukeRebar");
    expect(sml).toBeTruthy();
    expect(mod.create).toMatchObject({ provider: "ficsit", packageId: "NukeRebar", version: "1.2.0" });
    vi.unstubAllGlobals();
  });
});
