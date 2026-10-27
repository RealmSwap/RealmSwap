import { describe, it, expect, afterEach, beforeAll, afterAll, beforeEach } from "vitest";
import {
  curseForgeApiKey, pickCompatibleCfFile, curseForgeDownloadUrl, curseForgeSha1,
  collectRequiredCfMods, resolveCfInstall, searchCurseForgeMods,
  readCurseForgeManifest, cfLoaderRequirement, cfOverridesPrefix, resolveCfPackFiles,
  type CurseForgeFile, type CurseForgeMod,
} from "../curseforge";

// cfRequest requires a key before it touches fetch; the env is stubbed per
// test (a describe below saves/restores it) so the per-test deps only need to
// mock the network.
const SAVED_KEY = process.env.CURSEFORGE_API_KEY;
beforeEach(() => {
  process.env.CURSEFORGE_API_KEY = "test-key";
});
afterAll(() => {
  if (SAVED_KEY === undefined) delete process.env.CURSEFORGE_API_KEY;
  else process.env.CURSEFORGE_API_KEY = SAVED_KEY;
});

function cfFile(overrides: Partial<CurseForgeFile> = {}): CurseForgeFile {
  return {
    id: 1000,
    modId: 42,
    displayName: "Mod 1.0.0",
    fileName: "mod-1.0.0.jar",
    downloadUrl: "https://edge.forgecdn.net/files/1/0/mod-1.0.0.jar",
    hashes: [{ value: "a".repeat(40), algo: 1 }],
    gameVersions: ["1.21.1", "Fabric"],
    modLoaderType: 4,
    dependencies: [],
    isAvailable: true,
    ...overrides,
  };
}

function cfMod(overrides: Partial<CurseForgeMod> = {}): CurseForgeMod {
  return {
    id: 42,
    name: "Cool Mod",
    slug: "cool-mod",
    summary: "does things",
    downloadCount: 1234,
    ...overrides,
  };
}

/** Minimal fetch mock keyed by URL substring; POST /mods/files resolves via fileById. */
function mockFetch(routes: {
  mod?: Record<number, CurseForgeMod>;
  filesByMod?: Record<number, CurseForgeFile[]>;
  fileById?: Record<number, CurseForgeFile>;
  search?: CurseForgeMod[];
  categories?: { id: number; name: string; slug?: string }[];
}) {
  return (async (url: string | URL, init?: any) => {
    const u = url.toString();
    const json = async (data: any) => ({ ok: true, status: 200, json: async () => data }) as any;
    if (u.includes("/mods/search")) return json({ data: routes.search ?? [], pagination: { total: (routes.search ?? []).length } });
    if (u.includes("/categories")) return json({ data: routes.categories ?? [] });
    if (u.endsWith("/mods/files") && init?.method === "POST") {
      const body = JSON.parse(init.body) as { fileIds: number[] };
      return json({ data: body.fileIds.map((id) => routes.fileById?.[id]).filter(Boolean) });
    }
    if (init?.method === "POST") return json({ data: [] });
    const modMatch = u.match(/\/mods\/(\d+)\/files/);
    if (modMatch) return json({ data: routes.filesByMod?.[Number(modMatch[1])] ?? [] });
    const singleMod = u.match(/\/mods\/(\d+)$/);
    if (singleMod) {
      const mod = routes.mod?.[Number(singleMod[1])];
      if (!mod) return { ok: false, status: 404, json: async () => ({}) } as any;
      return json({ data: mod });
    }
    return { ok: false, status: 404, json: async () => ({}) } as any;
  }) as any;
}

describe("curseForgeApiKey", () => {
  const original = process.env.CURSEFORGE_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.CURSEFORGE_API_KEY;
    else process.env.CURSEFORGE_API_KEY = original;
  });

  it("normalizes backslash-escaped dollars from .env", () => {
    process.env.CURSEFORGE_API_KEY = "\\$2a\\$10\\$TzkK6AHtc3zXbrlIfyaAZO23MGZ/wMNZQbfE9ic.pRmO4tVMUzvvW";
    expect(curseForgeApiKey()).toBe("$2a$10$TzkK6AHtc3zXbrlIfyaAZO23MGZ/wMNZQbfE9ic.pRmO4tVMUzvvW");
  });

  it("passes through an already-expanded key", () => {
    process.env.CURSEFORGE_API_KEY = "$2a$10$TzkK6AHtc3zXbrlIfyaAZO23MGZ/wMNZQbfE9ic.pRmO4tVMUzvvW";
    expect(curseForgeApiKey()).toBe("$2a$10$TzkK6AHtc3zXbrlIfyaAZO23MGZ/wMNZQbfE9ic.pRmO4tVMUzvvW");
  });
});

describe("pickCompatibleCfFile", () => {
  const files = [
    cfFile({ id: 900, displayName: "older" }),
    cfFile({ id: 1100, displayName: "newest" }),
    cfFile({ id: 1200, displayName: "newest-but-locked", isAvailable: false }),
    cfFile({ id: 1300, displayName: "alternate", isAlternate: true }),
  ];

  it("picks the newest installable file", () => {
    expect(pickCompatibleCfFile(files, { mcVersion: "1.21.1", loader: "fabric" })?.displayName).toBe("newest");
  });

  it("filters by Minecraft version", () => {
    expect(pickCompatibleCfFile(files, { mcVersion: "1.20.1", loader: "fabric" })).toBeNull();
  });

  it("matches loader types, with neoforge satisfying legacy forge files", () => {
    const forge = cfFile({ modLoaderType: 1 });
    const fabric = cfFile({ modLoaderType: 4 });
    const any = cfFile({ modLoaderType: undefined });
    expect(pickCompatibleCfFile([forge], { mcVersion: "1.21.1", loader: "fabric" })).toBeNull();
    expect(pickCompatibleCfFile([forge], { mcVersion: "1.21.1", loader: "forge" })).toBe(forge);
    expect(pickCompatibleCfFile([forge], { mcVersion: "1.21.1", loader: "neoforge" })).toBe(forge);
    expect(pickCompatibleCfFile([fabric], { mcVersion: "1.21.1", loader: "neoforge" })).toBeNull();
    expect(pickCompatibleCfFile([any], { mcVersion: "1.21.1", loader: null })).toBe(any);
    expect(pickCompatibleCfFile([forge], { mcVersion: "1.21.1", loader: null })).toBeNull();
  });

  it("returns null when nothing is installable", () => {
    expect(pickCompatibleCfFile([cfFile({ isAvailable: false }), cfFile({ isAlternate: true })], {})).toBeNull();
    expect(pickCompatibleCfFile([], {})).toBeNull();
  });
});

describe("curseForgeDownloadUrl", () => {
  it("uses the API-provided URL when present", () => {
    expect(curseForgeDownloadUrl(cfFile())).toBe("https://edge.forgecdn.net/files/1/0/mod-1.0.0.jar");
  });

  it("derives the edge CDN URL from the file id", () => {
    expect(curseForgeDownloadUrl(cfFile({ downloadUrl: null, id: 8756581, fileName: "sodium-fabric-0.8.13+mc1.21.1.jar" }))).toBe(
      "https://edge.forgecdn.net/files/8756/581/sodium-fabric-0.8.13%2Bmc1.21.1.jar"
    );
  });

  it("refuses files with third-party distribution disabled", () => {
    expect(() => curseForgeDownloadUrl(cfFile({ downloadUrl: null, isAvailable: false }))).toThrow(
      /disabled third-party distribution/
    );
  });
});

describe("curseForgeSha1", () => {
  it("extracts the sha1 (algo 1) and ignores md5-only files", () => {
    expect(curseForgeSha1(cfFile())).toBe("a".repeat(40));
    expect(curseForgeSha1(cfFile({ hashes: [{ value: "b".repeat(32), algo: 2 }] }))).toBeNull();
  });
});

describe("collectRequiredCfMods", () => {
  // Dependency edges mirror the LIVE API shape: they reference PROJECT ids.
  const root = cfFile({
    id: 1,
    modId: 1,
    dependencies: [
      { modId: 2, relationType: 3 }, // required
      { modId: 3, relationType: 2 }, // optional — rides along, never installed
      { modId: 9, relationType: 3 }, // required but unresolvable
    ],
  });
  const depB = cfFile({ id: 2, modId: 2, dependencies: [{ modId: 4, relationType: 3 }] });
  const depC = cfFile({ id: 4, modId: 4, dependencies: [{ modId: 2, relationType: 3 }] }); // cycle back to mod 2
  const optionalFile = cfFile({ id: 3, modId: 3 });

  it("walks required deps dependency-first, ignoring optional and cycles", async () => {
    // project 9 is required by the root but unresolvable → collected as missing.
    const { order, missingProjectIds } = await collectRequiredCfMods(
      root,
      async (projectId) => ({ 2: depB, 4: depC, 3: optionalFile })[projectId] ?? null,
      () => false
    );
    expect(order.map((f) => f.modId)).toEqual([2, 4]);
    expect(missingProjectIds).toEqual([9]);
  });

  it("reports unresolvable deps and skips installed mods", async () => {
    const { order, missingProjectIds } = await collectRequiredCfMods(
      root,
      async (projectId) => (projectId === 2 ? depB : null),
      (projectId) => projectId === 2
    );
    expect(order).toEqual([]);
    expect(missingProjectIds).toEqual([9]);
  });
});

describe("resolveCfInstall", () => {
  const deps = {
    fetchImpl: mockFetch({
      mod: { 42: cfMod() },
      filesByMod: { 42: [cfFile({ id: 900 }), cfFile({ id: 1100, displayName: "Mod 2.0.0", fileName: "mod-2.0.0.jar" })] },
      fileById: { 900: cfFile({ id: 900 }) },
    }),
  };

  it("pins an exact fileId (pack exports)", async () => {
    const { file } = await resolveCfInstall("42", { fileId: 900 }, deps);
    expect(file.id).toBe(900);
  });

  it("pins an exact displayName (search cards)", async () => {
    const { file } = await resolveCfInstall("42", { displayName: "Mod 2.0.0" }, deps);
    expect(file.id).toBe(1100);
  });

  it("falls back to the newest compatible file", async () => {
    const { file } = await resolveCfInstall("42", {}, deps);
    expect(file.id).toBe(1100);
  });

  it("rejects non-numeric ids and unresolvable combos", async () => {
    await expect(resolveCfInstall("cool-mod", {}, deps)).rejects.toThrow(/not a CurseForge mod id/);
    await expect(resolveCfInstall("42", { mcVersion: "1.7.10" }, deps)).rejects.toThrow(/No downloadable file/);
  });
});

describe("searchCurseForgeMods", () => {
  it("builds the search query and parses the response", async () => {
    let seenUrl = "";
    const { data, total } = await searchCurseForgeMods(
      { gameId: 432, query: "sodium", sortField: 6 },
      { fetchImpl: (async (url: string | URL) => { seenUrl = url.toString(); return { ok: true, json: async () => ({ data: [cfMod()], pagination: { total: 77 } }) }; }) as any }
    );
    expect(seenUrl).toContain("gameId=432");
    expect(seenUrl).toContain("searchFilter=sodium");
    expect(seenUrl).toContain("sortField=6");
    expect(total).toBe(77);
    expect(data[0].name).toBe("Cool Mod");
  });

  it("fails loudly without a key", async () => {
    await expect(searchCurseForgeMods({ gameId: 432 }, { apiKey: null, fetchImpl: mockFetch({}) })).rejects.toThrow(
      /CURSEFORGE_API_KEY is not configured/
    );
  });
});

describe("readCurseForgeManifest", () => {
  const manifest = {
    manifestType: "minecraftModpack",
    manifestVersion: 1,
    name: "Pack",
    version: "1.0",
    minecraft: { version: "1.21.1", modLoaders: [{ id: "forge-47.2.0", primary: true }] },
    files: [{ projectID: 1, fileID: 2, required: true }],
    overrides: "overrides",
  };
  const zipOf = (content: Record<string, string>) =>
    ({
      getEntry: (name: string) => (content[name] !== undefined ? { name } : null),
      readAsText: (entry: { name: string }) => content[entry.name],
    }) as any;

  it("parses a valid manifest", () => {
    expect(readCurseForgeManifest(zipOf({ "manifest.json": JSON.stringify(manifest) })).name).toBe("Pack");
  });

  it("rejects missing, foreign, and malformed manifests", () => {
    expect(() => readCurseForgeManifest(zipOf({}))).toThrow(/manifest.json is missing/);
    expect(() =>
      readCurseForgeManifest(zipOf({ "manifest.json": JSON.stringify({ ...manifest, manifestType: "other" }) }))
    ).toThrow(/Unsupported CurseForge manifest/);
    expect(() =>
      readCurseForgeManifest(zipOf({ "manifest.json": JSON.stringify({ ...manifest, files: "nope" }) }))
    ).toThrow(/Malformed CurseForge manifest/);
  });
});

describe("cfLoaderRequirement", () => {
  it("parses the primary modLoader id", () => {
    const m = { minecraft: { version: "1", modLoaders: [{ id: "forge-47.2.0", primary: true }] } } as any;
    expect(cfLoaderRequirement(m)).toEqual({ type: "forge", version: "47.2.0" });
  });

  it("falls back to the first loader and rejects unknown kinds", () => {
    expect(cfLoaderRequirement({ minecraft: { version: "1", modLoaders: [{ id: "fabric-0.15.11" }] } } as any)).toEqual({
      type: "fabric",
      version: "0.15.11",
    });
    expect(cfLoaderRequirement({ minecraft: { version: "1", modLoaders: [{ id: "sponge-8" }] } } as any)).toBeNull();
    expect(cfLoaderRequirement({ minecraft: { version: "1", modLoaders: [] } } as any)).toBeNull();
  });
});

describe("cfOverridesPrefix", () => {
  it("honors a plain custom folder and rejects traversal", () => {
    expect(cfOverridesPrefix({ overrides: "overwrites" } as any)).toBe("overwrites/");
    expect(cfOverridesPrefix({ overrides: "../../etc" } as any)).toBe("overrides/");
    expect(cfOverridesPrefix({} as any)).toBe("overrides/");
  });
});

describe("resolveCfPackFiles", () => {
  const baseManifest = {
    manifestType: "minecraftModpack",
    manifestVersion: 1,
    name: "Pack",
    minecraft: { version: "1.21.1", modLoaders: [] },
    files: [],
  };

  it("resolves required files, dedupes, and skips optionals", async () => {
    const manifest = {
      ...baseManifest,
      files: [
        { projectID: 1, fileID: 100, required: true },
        { projectID: 2, fileID: 200, required: true },
        { projectID: 3, fileID: 300, required: false },
      ],
    } as any;
    const { files, modNames, skippedOptional } = await resolveCfPackFiles(manifest, {
      fetchImpl: (async (url: string | URL, init?: any) => {
        const u = url.toString();
        const json = (data: any) => ({ ok: true, status: 200, json: async () => data }) as any;
        if (u.endsWith("/mods") && init?.method === "POST") {
          const body = JSON.parse(init.body) as { modIds: number[] };
          return json({ data: body.modIds.map((id) => cfMod({ id, name: `Mod ${id}` })) });
        }
        if (u.endsWith("/mods/files") && init?.method === "POST") {
          const body = JSON.parse(init.body) as { fileIds: number[] };
          const byId: Record<number, CurseForgeFile> = {
            100: cfFile({ id: 100, modId: 1, displayName: "A 1.0" }),
            200: cfFile({ id: 200, modId: 2, displayName: "B 1.0" }),
          };
          return json({ data: body.fileIds.map((id) => byId[id]).filter(Boolean) });
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      }) as any,
    });
    expect(files.map((f) => f.id)).toEqual([100, 200]);
    expect(modNames.get(1)).toBe("Mod 1");
    expect(skippedOptional).toBe(1);
    expect(manifest.files).toHaveLength(3); // input untouched
  });

  it("fails closed on missing files, locked distribution, and hash-less files", async () => {
    const manifest = { ...baseManifest, files: [{ projectID: 1, fileID: 100, required: true }] } as any;
    const locked = cfFile({ id: 100, downloadUrl: null, isAvailable: false });
    const hashless = cfFile({ id: 100, hashes: [] });
    const deps = (file: CurseForgeFile | undefined) => ({
      fetchImpl: (async (url: string | URL, init?: any) => {
        const json = (data: any) => ({ ok: true, status: 200, json: async () => data }) as any;
        if (init?.method === "POST") return json({ data: file ? [file] : [] });
        return { ok: false, status: 404, json: async () => ({}) } as any;
      }) as any,
    });
    await expect(resolveCfPackFiles(manifest, deps(undefined))).rejects.toThrow(/no longer exists/);
    await expect(resolveCfPackFiles(manifest, deps(locked))).rejects.toThrow(/disabled third-party distribution/);
    await expect(resolveCfPackFiles(manifest, deps(hashless))).rejects.toThrow(/no sha1 hash/);
  });
});
