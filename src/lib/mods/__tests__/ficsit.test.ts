import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";

/**
 * ficsit.app (Satisfactory) search, version resolution and the FactoryGame/
 * Mods install layout. GraphQL and downloads run against injected fakes —
 * no test touches ficsit.app.
 */

const bag = vi.hoisted(() => ({
  upserts: [] as any[],
  bodies: null as null | ((url: string) => Buffer | null),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    get modInstallation() {
      return {
        upsert: async (args: any) => {
          bag.upserts.push(args);
          return {};
        },
      };
    },
  },
}));
vi.mock("@/lib/download", () => ({
  downloadFile: async (url: string, dest: string) => {
    const body = bag.bodies?.(url);
    if (!body) throw new Error(`no download body stubbed for ${url}`);
    fs.writeFileSync(dest, body);
  },
}));

import {
  searchFicsitMods, getFicsitModVersion, getFicsitModsByReferences,
  getFicsitLatestVersions, pickFicsitServerDownload, FICSIT_API,
} from "@/lib/mods/ficsit";
import { installFicsitMod, removeFicsitMod, ensureFicsitSml } from "@/lib/mods/installers";
import { checkModUpdates } from "@/lib/mods/updates";

const SML_ID = "smlgraphid00001";
const MOD_ID = "modgraphid0001";
const MOD_HASH = "a".repeat(64);

const smlVersion = {
  ver: "3.12.0", hash: "b".repeat(64),
  targets: [{ targetName: "WindowsServer", link: "/v1/version/smlver1/WindowsServer/download" }],
  dependencies: [],
};
const modVersion = {
  ver: "1.2.0", hash: MOD_HASH,
  targets: [{ targetName: "WindowsServer", link: "/v1/version/modver1/WindowsServer/download" }],
  dependencies: [{ mod_id: SML_ID, optional: false }],
};

const byRefData: Record<string, unknown> = {};
const getModData: Record<string, unknown> = {};
function graphqlFetch(routes: Record<string, unknown>) {
  return async (url: string, init?: RequestInit) => {
    if (url !== "https://api.ficsit.app/v2/query") return new Response("nope", { status: 404 });
    const body = JSON.parse(String(init?.body));
    const q: string = body.query;
    // Reference lookups must answer with the ASKED reference — the installer
    // resolves SML by reference and a static response would recurse forever.
    if (Array.isArray(body.variables?.filter?.references)) {
      const refs: string[] = body.variables.filter.references;
      const mods = refs.map((ref) => byRefData[ref]).filter(Boolean);
      return new Response(JSON.stringify({ data: { getMods: { mods } } }), { status: 200 });
    }
    // Same for getMod: answer with the ASKED id.
    if (q.includes("getMod(modId: $id)")) {
      const data = getModData[String(body.variables?.id ?? "")];
      if (data) return new Response(JSON.stringify({ data: { getMod: data } }), { status: 200 });
      return new Response(JSON.stringify({ data: { getMod: null } }), { status: 200 });
    }
    for (const [fragment, data] of Object.entries(routes)) {
      if (q.includes(fragment)) return new Response(JSON.stringify({ data }), { status: 200 });
    }
    return new Response(JSON.stringify({ errors: [{ message: "unrouted query" }] }), { status: 200 });
  };
}

const smlFull = {
  id: SML_ID, name: "Satisfactory Mod Loader", mod_reference: "SML", downloads: 999999,
  latestVersions: { release: smlVersion }, pinned: smlVersion,
};
const modFull = {
  id: MOD_ID, name: "Nuke Rebar", mod_reference: "NukeRebar", downloads: 96,
  latestVersions: { release: modVersion }, pinned: modVersion,
};
const standardRoutes = {
  "mods { id mod_reference }": {
    getMods: { mods: [{ id: SML_ID, mod_reference: "SML" }, { id: MOD_ID, mod_reference: "NukeRebar" }] },
  },
  "count mods {": {
    getMods: {
      count: 489,
      mods: [{ id: MOD_ID, name: "Nuke Rebar", mod_reference: "NukeRebar", downloads: 96, latestVersions: { release: { ver: "1.2.0" } } }],
    },
  },
  "mods { id latestVersions": {
    getMods: { mods: [{ id: MOD_ID, latestVersions: { release: { ver: "1.3.0" } } }] },
  },
};

function zipFor(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) zip.addFile(name, Buffer.from(content));
  return zip.toBuffer();
}

let dir: string;
beforeEach(() => {
  for (const k of Object.keys(getModData)) delete getModData[k];
  for (const k of Object.keys(byRefData)) delete byRefData[k];
  getModData[SML_ID] = smlFull;
  getModData[MOD_ID] = modFull;
  byRefData.SML = { id: SML_ID, name: "Satisfactory Mod Loader", mod_reference: "SML", downloads: 999999, latestVersions: { release: { ver: "3.12.0" } } };
  byRefData.NukeRebar = { id: MOD_ID, name: "Nuke Rebar", mod_reference: "NukeRebar", downloads: 96, latestVersions: { release: { ver: "1.2.0" } } };
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ficsit-test-"));
  bag.upserts = [];
  bag.bodies = (url) => {
    if (url === `${FICSIT_API}/v1/version/modver1/WindowsServer/download`) {
      return zipFor({ "NukeRebar.uplugin": "", "Binaries/Win64/FactoryServer-NukeRebar-Win64-Shipping.dll": "x" });
    }
    if (url === `${FICSIT_API}/v1/version/smlver1/WindowsServer/download`) {
      return zipFor({ "SML.uplugin": "", "Binaries/Win64/FactoryServer-SML-Win64-Shipping.dll": "x" });
    }
    return null;
  };
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ficsit search + resolution", () => {
  it("maps catalog search rows", async () => {
    const { mods, total } = await searchFicsitMods({ query: "refined" }, { fetchImpl: graphqlFetch(standardRoutes) });
    expect(total).toBe(489);
    expect(mods[0]).toMatchObject({ id: MOD_ID, name: "Nuke Rebar", modReference: "NukeRebar", latestVersion: "1.2.0" });
  });

  it("resolves by reference and by id, pinned and latest", async () => {
    const deps = { fetchImpl: graphqlFetch(standardRoutes) };
    const byRef = await getFicsitModsByReferences(["SML", "NukeRebar"], deps);
    expect(byRef.get("NukeRebar")).toBe(MOD_ID);

    const latest = await getFicsitModVersion({ modId: MOD_ID }, deps);
    expect(latest?.version.version).toBe("1.2.0");
    const pinned = await getFicsitModVersion({ modId: MOD_ID, versionNumber: "1.2.0" }, deps);
    expect(pinned?.version.version).toBe("1.2.0");
  });

  it("picks the WindowsServer download and leaves client-only mods null", () => {
    // Mapped shape (getFicsitModVersion renames the API's `ver` alias).
    const mapped = { ...modVersion, version: modVersion.ver };
    expect(pickFicsitServerDownload(mapped)).toContain("/WindowsServer/download");
    expect(pickFicsitServerDownload({ version: "1.0.0", targets: [{ targetName: "Windows", link: "/x" }], dependencies: [] })).toBeNull();
  });
});

describe("installFicsitMod", () => {
  it("installs with a stubbed global fetch (SML + deps + row)", async () => {
    const serverDir = path.join(dir, "satisfactory-server");
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, "FactoryServer.exe"), "exe");

    vi.stubGlobal("fetch", graphqlFetch(standardRoutes));
    const warnings: string[] = [];
    const result = await installFicsitMod({
      serverId: "s1", satisfactoryDir: serverDir, modId: "NukeRebar", warnings,
    });

    expect(result.dependencyCount).toBe(1); // SML auto-provisioned
    expect(fs.existsSync(path.join(serverDir, "FactoryGame", "Mods", "NukeRebar", "NukeRebar.uplugin"))).toBe(true);
    expect(fs.existsSync(path.join(serverDir, "FactoryGame", "Mods", "SML", "SML.uplugin"))).toBe(true);
    expect(fs.readFileSync(path.join(serverDir, "FactoryGame", "Mods", "NukeRebar", ".smm"), "utf-8")).toBe(MOD_HASH);
    const row = bag.upserts.find((u) => u.create?.packageId === "NukeRebar");
    expect(row.create).toMatchObject({ provider: "ficsit", packageId: "NukeRebar", version: "1.2.0" });
    vi.unstubAllGlobals();
  });

  it("refuses client-only mods before writing anything", async () => {
    const serverDir = path.join(dir, "satisfactory-server");
    fs.mkdirSync(serverDir, { recursive: true });
    const clientOnlyVersion = {
      ver: "1.0.0", hash: MOD_HASH,
      targets: [{ targetName: "Windows", link: "/v1/version/x/Windows/download" }],
      dependencies: [],
    };
    byRefData.WeatherOnly = { id: MOD_ID, name: "Weather Only", mod_reference: "WeatherOnly", downloads: 5, latestVersions: { release: { ver: "1.0.0" } } };
    getModData[MOD_ID] = {
      id: MOD_ID, name: "Weather Only", mod_reference: "WeatherOnly",
      latestVersions: { release: clientOnlyVersion }, pinned: clientOnlyVersion,
    };
    vi.stubGlobal("fetch", graphqlFetch(standardRoutes));
    const warnings: string[] = [];
    await expect(
      installFicsitMod({ serverId: "s1", satisfactoryDir: serverDir, modId: "WeatherOnly", warnings })
    ).rejects.toThrow(/no WindowsServer build/);
    expect(fs.existsSync(path.join(serverDir, "FactoryGame", "Mods"))).toBe(false);
    expect(bag.upserts).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe("removeFicsitMod", () => {
  it("removes the mod directory", () => {
    const serverDir = path.join(dir, "satisfactory-server");
    const modDir = path.join(serverDir, "FactoryGame", "Mods", "NukeRebar");
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(path.join(modDir, "x"), "x");
    removeFicsitMod(serverDir, "NukeRebar");
    expect(fs.existsSync(modDir)).toBe(false);
  });
});

describe("checkModUpdates ficsit rows", () => {
  it("reports stale ficsit mods from one batched lookup", async () => {
    const result = await checkModUpdates({
      game: "SATISFACTORY",
      serverRoot: dir,
      rows: [{ provider: "ficsit", packageId: "NukeRebar", version: "1.2.0", name: "Nuke Rebar" }],
      deps: {
        fetchFicsitRefs: async () => new Map([["NukeRebar", MOD_ID]]),
        fetchFicsitLatest: async () => new Map([[MOD_ID, "1.3.0"]]),
      },
    });
    expect(result.updates).toEqual([
      { packageId: "NukeRebar", name: "Nuke Rebar", provider: "ficsit", current: "1.2.0", latest: "1.3.0" },
    ]);
  });

  it("reports mods that vanished from ficsit.app", async () => {
    const result = await checkModUpdates({
      game: "SATISFACTORY",
      serverRoot: dir,
      rows: [{ provider: "ficsit", packageId: "Gone", version: "1.0.0", name: "Gone Mod" }],
      deps: {
        fetchFicsitRefs: async () => new Map(),
        fetchFicsitLatest: async () => new Map(),
      },
    });
    expect(result.updates).toEqual([]);
    expect(result.errors[0]).toContain("no longer available on ficsit.app");
  });
});
