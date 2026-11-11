import { describe, it, expect, vi, beforeEach } from "vitest";

// Publishing puts a realm's own game definition through the same gate a
// deploy runs, and stores the gate's normalized copy.

const cloud = {
  inserts: [] as { table: string; row: any }[],
  rpcs: [] as { name: string; args: any }[],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: any) => {
      cloud.rpcs.push({ name, args });
      return { data: { version: args.p_version }, error: null };
    },
    from: (table: string) => ({
      insert: (row: any) => {
        cloud.inserts.push({ table, row });
        const stored = { data: { id: "realm-1", ...row }, error: null };
        return {
          select: () => ({ single: async () => stored }),
          then: (resolve: (v: unknown) => void) => resolve({ error: null }),
        };
      },
    }),
  }),
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => ({ id: "user-1" }) }));

import { publishRealm } from "../publishRealm";

const payload = { version: "2.0", mods: [], configOverrides: [], startupParams: {} } as any;
const base = { name: "Cool Realm", description: "A realm", gameSlug: "COOLGAME", payload };
const goodDef = () => ({
  name: "Cool Game",
  recommendedRamGB: 6,
  install: { appId: "896660", installSubDir: "cool", checkFile: "cool_server.exe", requiredDiskGB: 2 },
  launch: { executable: "cool_server.exe", args: [] },
  defaultPort: 2456,
  params: [],
  configFiles: [],
  ports: [],
  strayKey: true,
});

beforeEach(() => {
  cloud.inserts = [];
  cloud.rpcs = [];
});

describe("publishRealm: custom game definitions", () => {
  it("publishes a data-only definition as the normalized spec plus its listing metadata", async () => {
    const result = await publishRealm({ ...base, customDefSpec: goodDef() }, "user-1");
    expect(result.status).toBe(200);
    const realmRow = cloud.inserts.find((i) => i.table === "realms")!.row;
    expect(realmRow.custom_def_spec).toMatchObject({ name: "Cool Game", recommendedRamGB: 6, install: { appId: "896660" } });
    expect(realmRow.custom_def_spec).not.toHaveProperty("strayKey");
    expect(realmRow.verified_level).toBe("UNVERIFIED");
  });

  it("gives every new realm a public address: slug + page URL in the response", async () => {
    const result = await publishRealm(base, "user-1");
    expect(result.status).toBe(200);
    const body = result.json as { slug: string; publicUrl: string };
    expect(body.slug).toMatch(/^cool-realm-[0-9a-f]{6}$/);
    expect(body.publicUrl).toContain(`/r/${body.slug}`);
    expect(cloud.inserts.find((i) => i.table === "realms")!.row.slug).toBe(body.slug);
  });

  it("keeps the explicit script refusals", async () => {
    const withInstallScript = { ...goodDef(), install: { installScript: "rd /s /q C:\\" } };
    const withLaunchScript = { ...goodDef(), launch: { executable: "x", args: [], launchScript: "calc" } };
    expect((await publishRealm({ ...base, customDefSpec: withInstallScript }, "user-1")).json.error).toMatch(/installScript/);
    expect((await publishRealm({ ...base, customDefSpec: withLaunchScript }, "user-1")).json.error).toMatch(/launchScript/);
    expect(cloud.inserts).toHaveLength(0);
  });

  it("refuses what the deploy gate would refuse, before anything reaches the cloud", async () => {
    const pathExe = { ...goodDef(), launch: { executable: "cmd.exe", executableOnPath: true, args: ["/c", "whoami"] } };
    const result = await publishRealm({ ...base, customDefSpec: pathExe }, "user-1");
    expect(result.status).toBe(400);
    expect(result.json.error).toMatch(/can't be shared/);
    expect(cloud.inserts).toHaveLength(0);
    expect(cloud.rpcs).toHaveLength(0);
  });

  it("applies the gate to new versions of an existing realm too", async () => {
    const traversal = { ...goodDef(), configFiles: [{ path: "..\\..\\startup.txt", strategy: "template", template: "x" }] };
    const refused = await publishRealm({ payload, realmId: "realm-1", version: "1.1.0", customDefSpec: traversal }, "user-1");
    expect(refused.status).toBe(400);
    expect(cloud.rpcs).toHaveLength(0);

    const accepted = await publishRealm({ payload, realmId: "realm-1", version: "1.1.0", customDefSpec: goodDef() }, "user-1");
    expect(accepted.status).toBe(200);
    expect(cloud.rpcs[0].args.p_custom_def_spec).not.toHaveProperty("strayKey");
  });

  it("realms for built-in games publish with no definition at all", async () => {
    const result = await publishRealm(base, "user-1");
    expect(result.status).toBe(200);
    expect(cloud.inserts.find((i) => i.table === "realms")!.row.custom_def_spec).toBeNull();
  });
});
