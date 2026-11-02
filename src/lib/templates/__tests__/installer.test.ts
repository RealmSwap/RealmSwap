import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Shell creation + config overrides: legacy payloads keep the historic
// placeholder behavior; v2 payloads defer mods/configs to materialization.

const bag = {
  definitions: [] as any[],
  createdServers: [] as any[],
  createdMods: [] as any[],
  logs: [] as any[],
};

vi.mock("@/lib/db", () => ({
  prisma: {
    gameDefinition: {
      findFirst: async ({ where }: any) => bag.definitions.find((d) => d.slug === where.slug) ?? null,
      findUniqueOrThrow: async ({ where }: any) => bag.definitions.find((d) => d.id === where.id)!,
      create: async ({ data }: any) => ({ id: "def-new", ...data }),
    },
    server: {
      create: async ({ data }: any) => {
        const s = { id: "srv-new", ...data };
        bag.createdServers.push(s);
        return s;
      },
      delete: vi.fn(async () => {}),
    },
    modInstallation: {
      create: async ({ data }: any) => {
        bag.createdMods.push(data);
        return data;
      },
    },
    activityLog: {
      create: async ({ data }: any) => {
        bag.logs.push(data);
        return data;
      },
    },
  },
}));

vi.mock("@/lib/appPaths", () => ({
  dataRoot: () => tmpRoot,
}));

import { createRealmServerShell, applyConfigOverrides } from "../installer";

let tmpRoot = "";

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rs-installer-"));
  bag.definitions = [
    {
      id: "def-mc",
      slug: "MINECRAFT",
      displayName: "Minecraft",
      recommendedRamGB: 4,
      spec: JSON.stringify({ install: { url: "https://x/server.jar", fileName: "server.jar", checkFile: "server.jar" }, launch: { executable: "java", args: [] }, defaultPort: 25565, params: [] }),
    },
  ];
  bag.createdServers = [];
  bag.createdMods = [];
  bag.logs = [];
});

const baseTemplate = (payload: any) => ({
  id: "realm-1",
  name: "Test Realm",
  gameSlug: "MINECRAFT",
  payload,
  customDefSpec: null,
});

describe("applyConfigOverrides", () => {
  it("writes allowed files and skips traversal + bad extensions", () => {
    const applied = applyConfigOverrides("srv-x", [
      { path: "config/game.ini", strategy: "template", content: "[a]\nb=1" },
      { path: "../escape.txt", strategy: "template", content: "evil" },
      { path: "/absolute/path.json", strategy: "template", content: "evil" },
      { path: "virus.exe", strategy: "template", content: "evil" },
    ]);
    expect(applied).toBe(1);
    expect(fs.readFileSync(path.join(tmpRoot, "local-servers", "srv-x", "config", "game.ini"), "utf-8")).toBe("[a]\nb=1");
    expect(fs.existsSync(path.join(tmpRoot, "escape.txt"))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, "local-servers", "srv-x", "virus.exe"))).toBe(false);
  });
});

describe("createRealmServerShell", () => {
  it("legacy payloads: placeholder mod rows + configs applied immediately", async () => {
    const shell = await createRealmServerShell(
      baseTemplate({
        version: "1.0.0",
        mods: [{ provider: "thunderstore", packageId: "x-Pack", name: "X" }],
        configOverrides: [{ path: "server.properties", strategy: "template", content: "motd=hi" }],
        startupParams: {},
      }),
      "user-1"
    );
    expect(shell.v2).toBe(false);
    expect(bag.createdMods).toHaveLength(1);
    expect(bag.createdMods[0]).toMatchObject({ serverId: "srv-new", provider: "thunderstore", version: "latest" });
    expect(fs.readFileSync(path.join(tmpRoot, "local-servers", "srv-new", "server.properties"), "utf-8")).toBe("motd=hi");
  });

  it("v2 payloads: no placeholder rows, configs deferred to materialize", async () => {
    const shell = await createRealmServerShell(
      baseTemplate({
        version: "2.0",
        mods: [{ provider: "modrinth", packageId: "carpet", name: "Carpet", version: "1.0" }],
        configOverrides: [{ path: "server.properties", strategy: "template", content: "motd=hi" }],
        startupParams: {},
        loader: { type: "fabric", loaderVersion: "0.20.1", minecraftVersion: "1.21.1" },
      }),
      "user-1"
    );
    expect(shell.v2).toBe(true);
    expect(bag.createdMods).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpRoot, "local-servers", "srv-new", "server.properties"))).toBe(false);
  });
});
