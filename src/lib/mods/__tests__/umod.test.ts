import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";

/**
 * uMod (Oxide) provider helpers. Real filesystem in a temp dir; the DB and
 * downloads are mocked, and search runs against an injected fetch so no test
 * touches umod.org (its aggressive rate limiting makes real requests in
 * tests both slow and flaky).
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
  mapUmodPlugin,
  isRustPlugin,
  searchUmodPlugins,
  installOxideCore,
  installRustUmodPlugin,
  removeRustUmodPlugin,
  checkUmodPluginUpdate,
  OXIDE_CORE_DOWNLOAD_URL,
  OXIDE_CORE_MARKER,
} from "@/lib/mods/umod";

const row = (over: Record<string, unknown> = {}) => ({
  name: "Kits",
  slug: "rust-kits",
  title: "Rust Kits",
  author: "k1lly0u",
  description: "kits",
  downloads: 100,
  latest_release_version: "4.4.10",
  latest_release_at: "2026-01-01T00:00:00Z",
  download_url: "https://umod.org/plugins/Kits.cs",
  category_tags: "rust",
  ...over,
});

function zipFor(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

describe("mapUmodPlugin / isRustPlugin", () => {
  it("maps a search.json row to the plugin shape", () => {
    const p = mapUmodPlugin(row());
    expect(p).toMatchObject({
      name: "Kits",
      title: "Rust Kits",
      latestReleaseVersion: "4.4.10",
      downloadUrl: "https://umod.org/plugins/Kits.cs",
    });
  });

  it("rejects rows without a name or download url", () => {
    expect(mapUmodPlugin({ ...row(), name: "" })).toBeNull();
    expect(mapUmodPlugin({ ...row(), download_url: undefined })).toBeNull();
    expect(mapUmodPlugin(null)).toBeNull();
  });

  it("treats rust and universal tags as installable, other games not", () => {
    expect(isRustPlugin("rust")).toBe(true);
    expect(isRustPlugin("universal")).toBe(true);
    expect(isRustPlugin("reign-of-kings")).toBe(false);
    expect(isRustPlugin("hurtworld,universal")).toBe(true);
    expect(isRustPlugin("")).toBe(false);
  });
});

describe("searchUmodPlugins", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  function fetchFor(pages: Record<string, any>) {
    return async (url: string) => {
      const page = new URL(url).searchParams.get("page") ?? "1";
      if (!(page in pages)) throw new Error(`unexpected page ${page}`);
      return jsonResponse(pages[page]);
    };
  }

  it("filters the all-games catalog to rust + universal plugins", async () => {
    const pages = {
      "1": {
        total: 3,
        data: [
          row(),
          row({ name: "Teleporter", category_tags: "reign-of-kings" }),
          row({ name: "ImageLibrary", category_tags: "universal" }),
        ],
      },
    };
    const { plugins, total } = await searchUmodPlugins(
      { query: "kit", offset: 0 },
      { fetchImpl: fetchFor(pages) }
    );
    expect(total).toBe(3); // the catalog total, unfiltered
    expect(plugins.map((p) => p.name)).toEqual(["Kits", "ImageLibrary"]);
  });

  it("maps offset to uMod's 10-per-page pagination", async () => {
    const seen: string[] = [];
    const fetchImpl = async (url: string) => {
      seen.push(new URL(url).searchParams.get("page") ?? "?");
      return jsonResponse({ total: 0, data: [] });
    };
    await searchUmodPlugins({ query: "x", offset: 10 }, { fetchImpl });
    expect(seen).toEqual(["2"]);
  });

  it("caches searches per (query, page)", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return jsonResponse({ total: 0, data: [] });
    };
    await searchUmodPlugins({ query: "cachecheck", offset: 0 }, { fetchImpl });
    await searchUmodPlugins({ query: "cachecheck", offset: 0 }, { fetchImpl });
    expect(calls).toBe(1);
  });

  it("surfaces rate limits as honest errors", async () => {
    const fetchImpl = async () => new Response("slow down", { status: 429 });
    await expect(
      searchUmodPlugins({ query: "rl", offset: 0 }, { fetchImpl })
    ).rejects.toThrow(/rate limit/i);
  });
});

describe("installOxideCore / installRustUmodPlugin / removeRustUmodPlugin", () => {
  let tmp = "";

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs-umod-"));
    bag.upserts = [];
    bag.bodies = null;
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("provisions Oxide, then writes the plugin .cs into Oxide/plugins", async () => {
    bag.bodies = (url) => {
      if (url === OXIDE_CORE_DOWNLOAD_URL) {
        return zipFor({ "RustDedicated_Data/Managed/Oxide.Core.dll": "oxide" });
      }
      if (url === "https://umod.org/plugins/Kits.cs") return Buffer.from("// Kits");
      return null;
    };
    await installRustUmodPlugin({
      serverId: "s1",
      rustDir: tmp,
      packageId: "Kits",
      name: "Rust Kits",
      version: "4.4.10",
      downloadUrl: "https://umod.org/plugins/Kits.cs",
      warnings: [],
    });
    expect(fs.readFileSync(path.join(tmp, "Oxide", "plugins", "Kits.cs"), "utf-8")).toBe("// Kits");
    expect(fs.existsSync(path.join(tmp, OXIDE_CORE_MARKER))).toBe(true);
    expect(bag.upserts.map((u) => u.where.serverId_provider_packageId.packageId)).toEqual(["Oxide", "Kits"]);
    expect(bag.upserts[1].create).toMatchObject({
      provider: "umod", packageId: "Kits", version: "4.4.10", name: "Rust Kits",
    });
  });

  it("skips the core download when the Oxide marker is already present", async () => {
    fs.mkdirSync(path.dirname(path.join(tmp, OXIDE_CORE_MARKER)), { recursive: true });
    fs.writeFileSync(path.join(tmp, OXIDE_CORE_MARKER), "installed");
    bag.bodies = (url) => (url === "https://umod.org/plugins/Kits.cs" ? Buffer.from("// Kits") : null);

    await installRustUmodPlugin({
      serverId: "s1",
      rustDir: tmp,
      packageId: "Kits",
      version: "4.4.10",
      downloadUrl: "https://umod.org/plugins/Kits.cs",
      warnings: [],
    });

    expect(bag.upserts.map((u) => u.where.serverId_provider_packageId.packageId)).toEqual(["Kits"]);
  });

  it("derives the download URL and version from plugin metadata without a pin", async () => {
    bag.bodies = (url) => {
      if (url === OXIDE_CORE_DOWNLOAD_URL) {
        return zipFor({ "RustDedicated_Data/Managed/Oxide.Core.dll": "oxide" });
      }
      return url === "https://umod.org/plugins/Kits.cs" ? Buffer.from("// Kits") : null;
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          name: "Kits",
          title: "Rust Kits",
          slug: "rust-kits",
          latest_release_version: "4.4.10",
          download_url: "https://umod.org/plugins/Kits.cs",
        }),
      }))
    );

    const warnings: string[] = [];
    await installRustUmodPlugin({
      serverId: "s1", rustDir: tmp, packageId: "Kits", warnings,
    });

    expect(warnings).toEqual([]);
    expect(fs.readFileSync(path.join(tmp, "Oxide", "plugins", "Kits.cs"), "utf-8")).toBe("// Kits");
    expect(bag.upserts[1].create).toMatchObject({ version: "4.4.10", name: "Rust Kits" });
  });

  it("warns and derives the .cs URL when metadata is unavailable", async () => {
    bag.bodies = (url) => {
      if (url === OXIDE_CORE_DOWNLOAD_URL) {
        return zipFor({ "RustDedicated_Data/Managed/Oxide.Core.dll": "oxide" });
      }
      return url === "https://umod.org/plugins/Kits.cs" ? Buffer.from("// Kits") : null;
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }))
    );

    const warnings: string[] = [];
    await installRustUmodPlugin({
      serverId: "s1", rustDir: tmp, packageId: "Kits", warnings,
    });

    expect(warnings).toHaveLength(1);
    expect(fs.readFileSync(path.join(tmp, "Oxide", "plugins", "Kits.cs"), "utf-8")).toBe("// Kits");
    expect(bag.upserts[1].create).toMatchObject({ version: "unknown" });
  });

  it("removes a plugin file and tolerates an absent one", () => {
    fs.mkdirSync(path.join(tmp, "Oxide", "plugins"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "Oxide", "plugins", "Kits.cs"), "// Kits");
    removeRustUmodPlugin(tmp, "Kits");
    expect(fs.existsSync(path.join(tmp, "Oxide", "plugins", "Kits.cs"))).toBe(false);
    expect(() => removeRustUmodPlugin(tmp, "Kits")).not.toThrow();
  });
});

describe("checkUmodPluginUpdate / fetchUmodPluginMeta", () => {
  it("reports up-to-date when the installed version matches the latest release", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ latest_release_version: "4.4.10", download_url: "https://umod.org/plugins/Kits.cs" }), { status: 200 });
    const check = await checkUmodPluginUpdate({ packageId: "KitCheck1", currentVersion: "4.4.10", deps: { fetchImpl } });
    expect(check).toEqual({ currentVersion: "4.4.10", latestVersion: "4.4.10", upToDate: true });
  });

  it("reports a newer release when one exists", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ latest_release_version: "4.5.0" }), { status: 200 });
    const check = await checkUmodPluginUpdate({ packageId: "KitCheck2", currentVersion: "4.4.10", deps: { fetchImpl } });
    expect(check.upToDate).toBe(false);
    expect(check.latestVersion).toBe("4.5.0");
  });

  it("returns upToDate null when uMod can't be reached (429)", async () => {
    const fetchImpl = async () => new Response("slow down", { status: 429 });
    const check = await checkUmodPluginUpdate({ packageId: "KitCheck3", currentVersion: "1.0.0", deps: { fetchImpl } });
    expect(check.upToDate).toBeNull();
    expect(check.latestVersion).toBeNull();
  });
});

describe("installRustUmodPlugin collection drift warning", () => {
  it("warns and installs latest when the exported version has moved on", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "umod-drift-"));
    try {
      const warnings: string[] = [];
      bag.bodies = (url) =>
        url === OXIDE_CORE_DOWNLOAD_URL
          ? zipFor({ "RustDedicated_Data/Managed/Oxide.Core.dll": "x" })
          : url === "https://umod.org/plugins/DriftCheck.cs"
            ? Buffer.from("// plugin")
            : null;
      await installRustUmodPlugin({
        serverId: "s1",
        rustDir: tmp,
        packageId: "DriftCheck",
        exportedVersion: "1.0.0",
        warnings,
        deps: {
          fetchImpl: async (url: string) => {
            if (url === "https://umod.org/plugins/DriftCheck.json") {
              return new Response(
                JSON.stringify({ latest_release_version: "2.0.0", download_url: "https://umod.org/plugins/DriftCheck.cs" }),
                { status: 200 }
              );
            }
            return new Response("nope", { status: 404 });
          },
        },
      });
      expect(warnings.some((w) => w.includes("DriftCheck") && w.includes("1.0.0") && w.includes("2.0.0"))).toBe(true);
      const pluginUpsert = bag.upserts.find((u: any) => u.create?.packageId === "DriftCheck");
      expect(pluginUpsert.create).toMatchObject({ packageId: "DriftCheck", version: "2.0.0" });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
