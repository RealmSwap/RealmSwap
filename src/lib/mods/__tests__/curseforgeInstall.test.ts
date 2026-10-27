import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { installMinecraftCurseforge } from "../installers";
import type { CurseForgeFile } from "../curseforge";

const prismaCalls: any[] = [];
vi.mock("@/lib/db", () => ({
  prisma: {
    modInstallation: {
      findMany: async () => [],
      upsert: async (args: any) => {
        prismaCalls.push(args);
        return {};
      },
    },
  },
}));

// The installer writes the downloaded bytes to mods/; the fixture jar is
// swapped per test so the manifest-inspection gate sees real content.
let currentFixture = "";
vi.mock("@/lib/download", () => ({
  downloadFile: async (_url: string, dest: string) => {
    fs.copyFileSync(currentFixture, dest);
  },
}));

const SAVED_KEY = process.env.CURSEFORGE_API_KEY;

describe("installMinecraftCurseforge", () => {
  let dir = "";
  let plainJar = "";
  let fabricJar = "";

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-install-"));
    const plain = new AdmZip();
    plain.addFile("dummy.txt", Buffer.from("not a mod manifest"));
    plainJar = path.join(dir, "plain.jar");
    plain.writeZip(plainJar);

    const fabric = new AdmZip();
    fabric.addFile("fabric.mod.json", Buffer.from(JSON.stringify({ id: "coomod", loader: { version: "0.15" } })));
    fabricJar = path.join(dir, "fabric.jar");
    fabric.writeZip(fabricJar);

    process.env.CURSEFORGE_API_KEY = "test-key";
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (SAVED_KEY === undefined) delete process.env.CURSEFORGE_API_KEY;
    else process.env.CURSEFORGE_API_KEY = SAVED_KEY;
  });

  beforeEach(() => {
    prismaCalls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubCfApi(main: CurseForgeFile, dep: CurseForgeFile) {
    vi.stubGlobal(
      "fetch",
      (async (url: string | URL, init?: any) => {
        const u = url.toString();
        const json = (data: any) => ({ ok: true, status: 200, json: async () => data }) as any;
        if (u.endsWith("/mods/files") && init?.method === "POST") {
          const body = JSON.parse(init.body) as { fileIds: number[] };
          return json({ data: body.fileIds.map((id) => (id === main.id ? main : id === dep.id ? dep : undefined)).filter(Boolean) });
        }
        if (u.endsWith("/mods") && init?.method === "POST") {
          const body = JSON.parse(init.body) as { modIds: number[] };
          return json({
            data: body.modIds.map((id) => ({ id, name: id === main.modId ? "Cool Mod" : "Dep Mod", slug: "x", summary: "", downloadCount: 0 })),
          });
        }
        if (u.match(/\/mods\/42\/files/)) return json({ data: [main, dep] });
        if (u.match(/\/mods\/43\/files/)) return json({ data: [dep] });
        if (u.match(/\/mods\/42$/)) return json({ data: { id: 42, name: "Cool Mod", slug: "cool-mod", summary: "", downloadCount: 5 } });
        return { ok: false, status: 404, json: async () => ({}) } as any;
      }) as any
    );
  }

  it("installs the mod + required dependency and records rows with real versions", async () => {
    currentFixture = plainJar;
    stubCfApi(
      {
        id: 1100, modId: 42, displayName: "Cool Mod 2.0.0", fileName: "cool-mod-2.0.0.jar",
        downloadUrl: "https://edge.forgecdn.net/files/1/100/cool-mod-2.0.0.jar", hashes: [],
        gameVersions: [], dependencies: [{ modId: 43, relationType: 3 }], isAvailable: true,
      },
      {
        id: 200, modId: 43, displayName: "Dep Mod 1.0", fileName: "dep-mod-1.0.jar",
        downloadUrl: "https://edge.forgecdn.net/files/0/200/dep-mod-1.0.jar", hashes: [],
        gameVersions: [], dependencies: [], isAvailable: true,
      }
    );
    const installDir = path.join(dir, "server-a");
    fs.mkdirSync(installDir, { recursive: true });
    const warnings: string[] = [];

    const result = await installMinecraftCurseforge({ serverId: "s1", installDir, modId: "42", warnings });

    expect(result.dependencyCount).toBe(1);
    expect(warnings).toEqual([]);
    expect(fs.existsSync(path.join(installDir, "mods", "42.jar"))).toBe(true);
    expect(fs.existsSync(path.join(installDir, "mods", "43.jar"))).toBe(true);

    const depRow = prismaCalls.find((c) => c.where.serverId_provider_packageId.packageId === "43");
    expect(depRow.create).toMatchObject({ provider: "curseforge", packageId: "43", version: "Dep Mod 1.0", name: "Dep Mod" });
    const mainRow = prismaCalls.find((c) => c.where.serverId_provider_packageId.packageId === "42");
    expect(mainRow.create).toMatchObject({
      provider: "curseforge", packageId: "42", version: "Cool Mod 2.0.0", name: "Cool Mod",
      dependencies: JSON.stringify(["43"]),
    });
  });

  it("refuses a loader-requiring jar with no loader installed and leaves no main jar", async () => {
    currentFixture = fabricJar;
    stubCfApi(
      {
        id: 1100, modId: 42, displayName: "Cool Mod 2.0.0", fileName: "cool-mod-2.0.0.jar",
        downloadUrl: "https://edge.forgecdn.net/files/1/100/cool-mod-2.0.0.jar", hashes: [],
        gameVersions: [], dependencies: [], isAvailable: true,
      },
      {
        id: 200, modId: 43, displayName: "Dep Mod 1.0", fileName: "dep-mod-1.0.jar",
        downloadUrl: "https://edge.forgecdn.net/files/0/200/dep-mod-1.0.jar", hashes: [],
        gameVersions: [], dependencies: [], isAvailable: true,
      }
    );
    const installDir = path.join(dir, "server-b");
    fs.mkdirSync(installDir, { recursive: true });
    const warnings: string[] = [];

    await expect(
      installMinecraftCurseforge({ serverId: "s1", installDir, modId: "42", warnings })
    ).rejects.toThrow(/requires the fabric loader/);

    expect(fs.existsSync(path.join(installDir, "mods", "42.jar"))).toBe(false);
    // No staging temp jar left behind.
    expect(fs.readdirSync(path.join(installDir, "mods")).filter((f) => f.startsWith(".staging"))).toEqual([]);
  });

  it("refuses a CurseForge modpack with a pointer to the Packs tab", async () => {
    currentFixture = plainJar;
    vi.stubGlobal(
      "fetch",
      (async (url: string | URL) => {
        const u = url.toString();
        // classId 4471 = the modpacks section — a pack must not ride the
        // single-mod installer (its zip would land in mods/ as a dead jar).
        if (u.match(/\/mods\/99$/)) {
          return {
            ok: true, status: 200,
            json: async () => ({ data: { id: 99, name: "All The Mods 10", slug: "atm10", summary: "", downloadCount: 1, classId: 4471 } }),
          } as any;
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      }) as any
    );
    const installDir = path.join(dir, "server-pack");
    fs.mkdirSync(installDir, { recursive: true });

    await expect(
      installMinecraftCurseforge({ serverId: "s1", installDir, modId: "99", warnings: [] })
    ).rejects.toThrow(/is a CurseForge modpack[\s\S]*Packs tab/);

    expect(fs.existsSync(path.join(installDir, "mods", "99.jar"))).toBe(false);
  });
});
