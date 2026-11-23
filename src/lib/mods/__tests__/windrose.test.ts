import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import {
  installWindroseCurseforge, extractWindrosePakFiles, removeWindroseFiles, windrosePaksDir,
} from "../installers";
import { removeModFiles } from "../uninstall";
import { setModDisabled } from "../lifecycle";
import type { CurseForgeFile } from "../curseforge";

const prismaCalls: any[] = [];
vi.mock("@/lib/db", () => ({
  prisma: {
    modInstallation: {
      upsert: async (args: any) => {
        prismaCalls.push(args);
        return {};
      },
    },
  },
}));

// The installer stages the downloaded zip inside the server dir; the fixture
// zip is swapped per test so extraction sees real entries.
let currentFixture = "";
vi.mock("@/lib/download", () => ({
  downloadFile: async (_url: string, dest: string) => {
    fs.copyFileSync(currentFixture, dest);
  },
}));

const SAVED_KEY = process.env.CURSEFORGE_API_KEY;

function pakSetZip(name: string): string {
  const zip = new AdmZip();
  // CurseForge zips wrap the pak set in a version folder; a stray non-pak
  // file (readme) rides along.
  zip.addFile(`${name}/000_${name}_P.pak`, Buffer.from("pak-bytes"));
  zip.addFile(`${name}/000_${name}_P.ucas`, Buffer.from("ucas-bytes"));
  zip.addFile(`${name}/000_${name}_P.utoc`, Buffer.from("utoc-bytes"));
  zip.addFile(`${name}/readme.txt`, Buffer.from("not a pak"));
  const p = path.join(dir, `${name}.zip`);
  zip.writeZip(p);
  return p;
}

function stubCfApi(files: CurseForgeFile[]) {
  vi.stubGlobal(
    "fetch",
    (async (url: string | URL) => {
      const u = url.toString();
      const json = (data: any) => ({ ok: true, status: 200, json: async () => data }) as any;
      if (u.match(/\/mods\/777\/files/)) return json({ data: files });
      if (u.match(/\/mods\/777$/)) {
        return json({ data: { id: 777, name: "Bigger Stacks", slug: "bigger-stacks", summary: "", downloadCount: 5 } });
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    }) as any
  );
}

function cfFile(over: Partial<CurseForgeFile>): CurseForgeFile {
  return {
    id: 900, modId: 777, displayName: "Bigger Stacks 1.0", fileName: "BiggerStacks.zip",
    downloadUrl: "https://edge.forgecdn.net/files/0/900/BiggerStacks.zip",
    hashes: [], gameVersions: ["0.10.0.6"], dependencies: [], isAvailable: true,
    ...over,
  };
}

let dir = "";

describe("Windrose CurseForge pak installs", () => {
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "windrose-mods-"));
    process.env.CURSEFORGE_API_KEY = "test-key";
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (SAVED_KEY === undefined) delete process.env.CURSEFORGE_API_KEY;
    else process.env.CURSEFORGE_API_KEY = SAVED_KEY;
  });

  beforeEach(() => {
    prismaCalls.length = 0;
    fs.mkdirSync(path.join(dir, "srv", "windrose-server"), { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fs.rmSync(path.join(dir, "srv"), { recursive: true, force: true });
  });

  it("extracts pak sets flat out of the zip's wrapper folder, ignoring non-pak entries", () => {
    const zip = new AdmZip(pakSetZip("Bigger Stacks x999"));
    const paksDir = path.join(dir, "flat");
    const written = extractWindrosePakFiles(zip, paksDir);
    expect(written.sort()).toEqual([
      "000_Bigger Stacks x999_P.pak",
      "000_Bigger Stacks x999_P.ucas",
      "000_Bigger Stacks x999_P.utoc",
    ]);
    for (const name of written) {
      expect(fs.existsSync(path.join(paksDir, name))).toBe(true);
    }
    expect(fs.existsSync(path.join(paksDir, "readme.txt"))).toBe(false);
  });

  it("installs the newest file into R5/Content/Paks/~mods and records the manifest", async () => {
    currentFixture = pakSetZip("Bigger Stacks v2");
    stubCfApi([
      cfFile({ id: 900, displayName: "Bigger Stacks 1.0", fileName: "v1.zip" }),
      cfFile({ id: 901, displayName: "Bigger Stacks 2.0", fileName: "v2.zip", downloadUrl: "https://edge.forgecdn.net/files/0/901/v2.zip" }),
    ]);
    const windroseDir = path.join(dir, "srv", "windrose-server");

    await installWindroseCurseforge({ serverId: "s1", windroseDir, modId: "777" });

    const paksDir = windrosePaksDir(windroseDir);
    expect(fs.existsSync(path.join(paksDir, "000_Bigger Stacks v2_P.pak"))).toBe(true);
    const upsert = prismaCalls[0].where.serverId_provider_packageId;
    expect(upsert).toEqual({ serverId: "s1", provider: "curseforge", packageId: "777" });
    const create = prismaCalls[0].create;
    expect(create.version).toBe("Bigger Stacks 2.0");
    const manifest = JSON.parse(create.files);
    expect(manifest).toContain("000_Bigger Stacks v2_P.pak");
    expect(manifest).toContain("000_Bigger Stacks v2_P.utoc");
  });

  it("honors a displayName pin from a search card", async () => {
    currentFixture = pakSetZip("v1");
    stubCfApi([
      cfFile({ id: 900, displayName: "Bigger Stacks 1.0", fileName: "v1.zip" }),
      cfFile({ id: 901, displayName: "Bigger Stacks 2.0", fileName: "v2.zip" }),
    ]);
    const windroseDir = path.join(dir, "srv", "windrose-server");

    await installWindroseCurseforge({ serverId: "s1", windroseDir, modId: "777", version: "Bigger Stacks 1.0" });

    expect(prismaCalls[0].create.version).toBe("Bigger Stacks 1.0");
    expect(fs.existsSync(path.join(windrosePaksDir(windroseDir), "000_v1_P.pak"))).toBe(true);
  });

  it("refuses a zip with no pak set — UE4SS scripts are client-side only", async () => {
    const zip = new AdmZip();
    zip.addFile("UE4SS/Mods/FastTravel/Scripts/main.lua", Buffer.from("return {}"));
    currentFixture = path.join(dir, "scripts.zip");
    zip.writeZip(currentFixture);
    stubCfApi([cfFile({})]);
    const windroseDir = path.join(dir, "srv", "windrose-server");

    await expect(
      installWindroseCurseforge({ serverId: "s1", windroseDir, modId: "777" })
    ).rejects.toThrow(/no pak files/);
    expect(prismaCalls).toHaveLength(0);
  });

  it("uninstall removes exactly the manifest's files (and parked copies), nothing else", () => {
    const windroseDir = path.join(dir, "srv", "windrose-server");
    const paksDir = windrosePaksDir(windroseDir);
    fs.mkdirSync(paksDir, { recursive: true });
    fs.writeFileSync(path.join(paksDir, "000_mine_P.pak"), "x");
    fs.writeFileSync(path.join(paksDir, "000_other_P.pak"), "y");
    const disabledDir = path.join(windroseDir, "R5", "Content", "Paks", "~mods-disabled");
    fs.mkdirSync(disabledDir, { recursive: true });
    fs.writeFileSync(path.join(disabledDir, "000_mine_P.pak.disabled"), "z");

    removeModFiles({
      game: "WINDROSE",
      serverRoot: path.join(dir, "srv"),
      installation: { provider: "curseforge", packageId: "777", files: JSON.stringify(["000_mine_P.pak"]) },
    });

    expect(fs.existsSync(path.join(paksDir, "000_mine_P.pak"))).toBe(false);
    expect(fs.existsSync(path.join(paksDir, "000_other_P.pak"))).toBe(true);
    expect(fs.existsSync(path.join(disabledDir, "000_mine_P.pak.disabled"))).toBe(false);
  });

  it("a torn manifest removes nothing", () => {
    const windroseDir = path.join(dir, "srv", "windrose-server");
    const paksDir = windrosePaksDir(windroseDir);
    fs.mkdirSync(paksDir, { recursive: true });
    fs.writeFileSync(path.join(paksDir, "000_other_P.pak"), "y");

    removeWindroseFiles(windroseDir, "{not json");

    expect(fs.existsSync(path.join(paksDir, "000_other_P.pak"))).toBe(true);
  });

  it("disable parks the manifest files in ~mods-disabled; enable restores them", async () => {
    const serverRoot = path.join(dir, "srv");
    const windroseDir = path.join(serverRoot, "windrose-server");
    const paksDir = windrosePaksDir(windroseDir);
    fs.mkdirSync(paksDir, { recursive: true });
    fs.writeFileSync(path.join(paksDir, "000_mine_P.pak"), "x");
    const installation = {
      provider: "curseforge", packageId: "777",
      files: JSON.stringify(["000_mine_P.pak"]),
    };

    await setModDisabled({ serverRoot, game: "WINDROSE", installation, disabled: true });
    expect(fs.existsSync(path.join(paksDir, "000_mine_P.pak"))).toBe(false);
    const parked = path.join(windroseDir, "R5", "Content", "Paks", "~mods-disabled", "000_mine_P.pak");
    expect(fs.existsSync(parked)).toBe(true);

    await setModDisabled({ serverRoot, game: "WINDROSE", installation, disabled: false });
    expect(fs.existsSync(path.join(paksDir, "000_mine_P.pak"))).toBe(true);
  });

  it("toggling without a manifest fails loudly instead of guessing", async () => {
    await expect(
      setModDisabled({
        serverRoot: path.join(dir, "srv"), game: "WINDROSE",
        installation: { provider: "curseforge", packageId: "777" }, disabled: true,
      })
    ).rejects.toThrow(/manifest/);
  });
});
