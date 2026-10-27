import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { resolveModUpdate } from "../updateApply";

const prismaCalls: any[] = [];
let installedRows: { packageId: string }[] = [];
vi.mock("@/lib/db", () => ({
  prisma: {
    modInstallation: {
      findMany: async () => installedRows,
      upsert: async (args: any) => {
        prismaCalls.push(args);
        return {};
      },
    },
  },
}));

const downloadCalls: { url: string; dest: string }[] = [];
vi.mock("@/lib/download", () => ({
  downloadFile: async (url: string, dest: string) => {
    downloadCalls.push({ url, dest });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, "bytes");
  },
}));

const jsonRes = (data: any) => ({ ok: true, status: 200, json: async () => data }) as any;

const SAVED_DATA_DIR = process.env.GAMEVAULT_DATA_DIR;
const SAVED_KEY = process.env.CURSEFORGE_API_KEY;

describe("resolveModUpdate — new required dependencies ride the update", () => {
  beforeAll(() => {
    process.env.GAMEVAULT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "update-deps-"));
    process.env.CURSEFORGE_API_KEY = "test-key";
  });
  afterAll(() => {
    fs.rmSync(process.env.GAMEVAULT_DATA_DIR!, { recursive: true, force: true });
    if (SAVED_DATA_DIR === undefined) delete process.env.GAMEVAULT_DATA_DIR;
    else process.env.GAMEVAULT_DATA_DIR = SAVED_DATA_DIR;
    if (SAVED_KEY === undefined) delete process.env.CURSEFORGE_API_KEY;
    else process.env.CURSEFORGE_API_KEY = SAVED_KEY;
  });

  beforeEach(() => {
    prismaCalls.length = 0;
    downloadCalls.length = 0;
    installedRows = [];
    vi.unstubAllGlobals();
  });

  it("modrinth: downloads and records a dependency the new version added", async () => {
    vi.stubGlobal(
      "fetch",
      (async (url: string | URL) => {
        const u = url.toString();
        if (u.endsWith("/project/mainmod")) {
          return jsonRes({ id: "mainmod", slug: "mainmod", title: "Main Mod", server_side: "required", client_side: "optional" });
        }
        if (u.endsWith("/project/mainmod/version")) {
          return jsonRes([{
            id: "v2", project_id: "mainmod", version_number: "2.0.0",
            game_versions: ["1.21.1"], loaders: ["fabric"],
            dependencies: [{ project_id: "newdep", dependency_type: "required" }],
            files: [{ url: "https://cdn.modrinth.com/mainmod-2.0.0.jar", filename: "mainmod-2.0.0.jar", primary: true }],
          }]);
        }
        if (u.endsWith("/project/newdep/version")) {
          return jsonRes([{
            id: "d1", project_id: "newdep", version_number: "1.0.0",
            game_versions: ["1.21.1"], loaders: ["fabric"], dependencies: [],
            files: [{ url: "https://cdn.modrinth.com/newdep-1.0.0.jar", filename: "newdep-1.0.0.jar", primary: true }],
          }]);
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      }) as any
    );

    const resolved = await resolveModUpdate(
      { provider: "modrinth", packageId: "mainmod", version: "1.0.0", name: "Main Mod" },
      "MINECRAFT", "srv1"
    );
    expect(resolved.newVersionNumber).toBe("2.0.0");
    expect(resolved.warnings).toBeUndefined();
    expect(resolved.rowPatch?.dependencies).toBe(JSON.stringify(["newdep"]));

    await resolved.applyUpdate();
    expect(downloadCalls.map((d) => d.url)).toEqual([
      "https://cdn.modrinth.com/newdep-1.0.0.jar",
      "https://cdn.modrinth.com/mainmod-2.0.0.jar",
    ]);
    const depRow = prismaCalls.find((c) => c.where.serverId_provider_packageId.packageId === "newdep");
    expect(depRow.create).toMatchObject({ provider: "modrinth", packageId: "newdep", version: "1.0.0" });
  });

  it("modrinth: skips installed dependencies and warns on unresolvable ones", async () => {
    installedRows = [{ packageId: "newdep" }];
    vi.stubGlobal(
      "fetch",
      (async (url: string | URL) => {
        const u = url.toString();
        if (u.endsWith("/project/mainmod")) {
          return jsonRes({ id: "mainmod", slug: "mainmod", title: "Main Mod", server_side: "required", client_side: "optional" });
        }
        if (u.endsWith("/project/mainmod/version")) {
          return jsonRes([{
            id: "v3", project_id: "mainmod", version_number: "3.0.0",
            game_versions: ["1.21.1"], loaders: ["fabric"],
            dependencies: [
              { project_id: "newdep", dependency_type: "required" },
              { project_id: "ghostdep", dependency_type: "required" },
            ],
            files: [{ url: "https://cdn.modrinth.com/mainmod-3.0.0.jar", filename: "mainmod-3.0.0.jar", primary: true }],
          }]);
        }
        if (u.endsWith("/project/ghostdep/version")) return jsonRes([]); // no compatible release
        return { ok: false, status: 404, json: async () => ({}) } as any;
      }) as any
    );

    const resolved = await resolveModUpdate(
      { provider: "modrinth", packageId: "mainmod", version: "2.0.0", name: "Main Mod" },
      "MINECRAFT", "srv1"
    );
    expect(resolved.warnings?.join(" ")).toMatch(/Dependency ghostdep has no compatible version/);
    await resolved.applyUpdate();
    // Only the main file: newdep was already installed.
    expect(downloadCalls.map((d) => d.url)).toEqual(["https://cdn.modrinth.com/mainmod-3.0.0.jar"]);
    // Same semantics as installs: the column records deps installed alongside
    // this update — already-present ones aren't re-listed.
    expect(resolved.rowPatch?.dependencies).toBe(JSON.stringify([]));
  });

  it("curseforge: downloads and records a dependency the new file added", async () => {
    vi.stubGlobal(
      "fetch",
      (async (url: string | URL, init?: any) => {
        const u = url.toString();
        if (u.includes("/mods/42/files")) {
          return jsonRes({ data: [{
            id: 1100, modId: 42, displayName: "Cool Mod 2.0.0", fileName: "cool-mod-2.0.0.jar",
            downloadUrl: "https://edge.forgecdn.net/files/1/100/cool-mod-2.0.0.jar", hashes: [],
            gameVersions: [], dependencies: [{ modId: 43, relationType: 3 }], isAvailable: true,
          }] });
        }
        if (u.includes("/mods/43/files")) {
          return jsonRes({ data: [{
            id: 200, modId: 43, displayName: "Dep Mod 1.0", fileName: "dep-mod-1.0.jar",
            downloadUrl: "https://edge.forgecdn.net/files/0/200/dep-mod-1.0.jar", hashes: [],
            gameVersions: [], dependencies: [], isAvailable: true,
          }] });
        }
        if (u.endsWith("/mods/files") && init?.method === "POST") {
          const body = JSON.parse(init.body) as { fileIds: number[] };
          return jsonRes({
            data: body.fileIds.map((id) => id === 200 ? {
              id: 200, modId: 43, displayName: "Dep Mod 1.0", fileName: "dep-mod-1.0.jar",
              downloadUrl: "https://edge.forgecdn.net/files/0/200/dep-mod-1.0.jar", hashes: [],
              gameVersions: [], dependencies: [], isAvailable: true,
            } : undefined).filter(Boolean),
          });
        }
        if (u.endsWith("/mods") && init?.method === "POST") {
          const body = JSON.parse(init.body) as { modIds: number[] };
          return jsonRes({ data: body.modIds.map((id) => ({ id, name: "Dep Mod", slug: "x", summary: "", downloadCount: 0 })) });
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      }) as any
    );

    const resolved = await resolveModUpdate(
      { provider: "curseforge", packageId: "42", version: "Cool Mod 1.0.0", name: "Cool Mod" },
      "MINECRAFT", "srv1"
    );
    expect(resolved.newVersionNumber).toBe("Cool Mod 2.0.0");
    expect(resolved.rowPatch?.dependencies).toBe(JSON.stringify(["43"]));

    await resolved.applyUpdate();
    expect(downloadCalls.map((d) => path.basename(d.dest))).toEqual(["43.jar", "42.jar"]);
    const depRow = prismaCalls.find((c) => c.where.serverId_provider_packageId.packageId === "43");
    expect(depRow.create).toMatchObject({ provider: "curseforge", packageId: "43", version: "Dep Mod 1.0", name: "Dep Mod" });
  });
});
