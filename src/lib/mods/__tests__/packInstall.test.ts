import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { createHash } from "crypto";
import { planModpackFromZip, applyModpackPlan, PackPreflightError, type ModpackPlan } from "../packInstall";
import { dupEntryZip, dupEntryJarBytes } from "./zipFixtures";

const sha1Of = (buf: Buffer) => createHash("sha1").update(buf).digest("hex");

const prismaCalls: any[] = [];
vi.mock("@/lib/db", () => ({
  prisma: {
    modInstallation: {
      findMany: async () => [],
      upsert: async (args: any) => {
        prismaCalls.push(args);
        return {};
      },
      deleteMany: async (args: any) => {
        prismaCalls.push(args);
        return {};
      },
    },
  },
}));

// Tests stage real jar bytes per URL for the CF download path.
const downloadFixtures = new Map<string, Buffer>();
vi.mock("@/lib/download", () => ({
  downloadFile: async (url: string, dest: string) => {
    const fixture = downloadFixtures.get(url);
    if (!fixture) throw new Error(`no download fixture staged for ${url}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, fixture);
  },
}));

vi.mock("@/lib/mods/mcServerJar", () => ({
  // Plan-time resolution stands in for piston-meta; the swap itself is a spy.
  resolveVanillaServerJar: async (mcVersion: string) => ({
    url: `https://piston-data.mojang.com/${mcVersion}/server.jar`,
    sha1: null,
  }),
  applyVanillaServerSwap: async () => {
    (globalThis as any).__mcSwaps = ((globalThis as any).__mcSwaps ?? 0) + 1;
  },
}));

// The four loader installers are network-heavy boundaries — spy, keep the
// marker read/write helpers real so tests exercise actual marker files.
const loaderCalls: { loader: string; mcVersion: string; pinned?: string }[] = [];
vi.mock("@/lib/mods/mcLoaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mcLoaders")>()),
  installFabricServer: async (_dir: string, mcVersion: string) => {
    loaderCalls.push({ loader: "fabric", mcVersion });
    return {};
  },
  installForgeServer: async (_dir: string, mcVersion: string, opts: any) => {
    loaderCalls.push({ loader: "forge", mcVersion, pinned: opts?.pinnedVersion });
    return {};
  },
  installQuiltServer: async (_dir: string, mcVersion: string, opts: any) => {
    loaderCalls.push({ loader: "quilt", mcVersion, pinned: opts?.pinnedVersion });
    return {};
  },
  installNeoForgeServer: async (_dir: string, mcVersion: string, opts: any) => {
    loaderCalls.push({ loader: "neoforge", mcVersion, pinned: opts?.pinnedVersion });
    return {};
  },
}));

// Keep manifest parsing real; only the per-file API resolution is a boundary.
vi.mock("@/lib/mods/curseforge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../curseforge")>()),
  resolveCfPackFiles: async () => ({ files: [], modNames: new Map(), skippedOptional: 0 }),
}));

function cfPackZip(mcVersion: string, loaderId: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "manifest.json",
    Buffer.from(JSON.stringify({
      manifestType: "minecraftModpack",
      manifestVersion: 1,
      name: "All The Mods 10",
      version: "1.2.0",
      minecraft: { version: mcVersion, modLoaders: [{ id: loaderId, primary: true }] },
      files: [],
    }))
  );
  return zip.toBuffer();
}

afterEach(() => {
  (globalThis as any).__mcSwaps = 0;
  loaderCalls.length = 0;
});

describe("planModpackFromZip — Minecraft version switch", () => {
  it("plans a server.jar switch when the pack targets a different release", async () => {
    const plan = await planModpackFromZip({
      zipBuffer: cfPackZip("1.21.1", "neoforge-21.1.95"),
      serverMcVersion: "1.21.9",
      loaderType: null,
    });
    expect(plan.mcSwitch).toMatchObject({ from: "1.21.9", to: "1.21.1" });
    expect(plan.mcSwitch!.jar.url).toContain("1.21.1");
    expect(plan.packLoader).toEqual({ type: "neoforge", version: "21.1.95" });
  });

  it("plans no switch when the server already runs the pack's version", async () => {
    const plan = await planModpackFromZip({
      zipBuffer: cfPackZip("1.21.1", "neoforge-21.1.95"),
      serverMcVersion: "1.21.1",
      loaderType: null,
    });
    expect(plan.mcSwitch).toBeNull();
  });

  it("still refuses a loader conflict (pack wants a different loader than installed)", async () => {
    await expect(
      planModpackFromZip({
        zipBuffer: cfPackZip("1.21.1", "fabric-0.16.9"),
        serverMcVersion: "1.21.1",
        loaderType: "neoforge",
      })
    ).rejects.toThrow(/requires the Fabric loader/);
  });
});

describe("planModpackFromZip — malformed archives", () => {
  it("refuses a pack zip with duplicated entry names as a readable preflight error", async () => {
    const malformed = dupEntryZip([
      {
        name: "manifest.json",
        data: JSON.stringify({
          manifestType: "minecraftModpack",
          manifestVersion: 1,
          name: "Broken Pack",
          version: "1.0.0",
          minecraft: { version: "1.21.1", modLoaders: [] },
          files: [],
        }),
      },
      { name: "META-INF/LICENSE.TXT", data: "first copy" },
      { name: "META-INF/LICENSE.TXT", data: "second copy" },
    ]);
    const error = await planModpackFromZip({
      zipBuffer: malformed,
      serverMcVersion: "1.21.1",
      loaderType: null,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackPreflightError);
    expect((error as Error).message).toMatch(/couldn't be opened/);
  });
});

function manualPlan(overrides: Partial<ModpackPlan>): ModpackPlan {
  return {
    kind: "curseforge",
    zip: new AdmZip(),
    packName: "All The Mods 10",
    packVersion: "1.2.0",
    packMcVersion: "1.21.1",
    packLoader: { type: "neoforge", version: "21.1.95" },
    mcSwitch: null,
    cfManifest: null,
    cfPlan: { files: [], modNames: new Map(), skippedOptional: 0 },
    mrpackIndex: null,
    overridesPrefixes: ["overrides/"],
    ...overrides,
  };
}

describe("applyModpackPlan — loader handling around the version switch", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-apply-"));
    (globalThis as any).__mcSwaps = 0;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeMarker(type: string, loaderVersion: string, minecraftVersion: string) {
    fs.writeFileSync(
      path.join(root, "realmswap-loader.json"),
      JSON.stringify({ type, loaderVersion, minecraftVersion, installedAt: new Date().toISOString() })
    );
  }

  it("swaps the jar and reinstalls the pinned loader even over a same-type old loader", async () => {
    writeMarker("neoforge", "21.1.90", "1.21.9");
    const warnings: string[] = [];
    const result = await applyModpackPlan({
      plan: manualPlan({ mcSwitch: { from: "1.21.9", to: "1.21.1", jar: { url: "https://x", sha1: null, size: null } } }),
      serverId: "s1",
      serverRoot: root,
      serverMcVersion: "1.21.9",
      warnings,
    });
    expect((globalThis as any).__mcSwaps).toBe(1);
    expect(loaderCalls).toEqual([{ loader: "neoforge", mcVersion: "1.21.1", pinned: "21.1.95" }]);
    expect(result.mcSwitchedTo).toBe("1.21.1");
  });

  it("keeps the skip-when-matching behavior when no version switch happened", async () => {
    writeMarker("neoforge", "21.1.90", "1.21.1");
    const warnings: string[] = [];
    await applyModpackPlan({
      plan: manualPlan({ packMcVersion: "1.21.1" }),
      serverId: "s1",
      serverRoot: root,
      serverMcVersion: "1.21.1",
      warnings,
    });
    expect((globalThis as any).__mcSwaps).toBe(0);
    expect(loaderCalls).toEqual([]);
    expect(warnings.join(" ")).toMatch(/Pack pins NeoForge loader 21\.1\.95; server has 21\.1\.90/);
  });

  it("warns that an existing loader is stale when the pack pins none but the version changed", async () => {
    writeMarker("fabric", "0.16.9", "1.21.9");
    const warnings: string[] = [];
    await applyModpackPlan({
      plan: manualPlan({
        packLoader: null,
        mcSwitch: { from: "1.21.9", to: "1.21.1", jar: { url: "https://x", sha1: null, size: null } },
      }),
      serverId: "s1",
      serverRoot: root,
      serverMcVersion: "1.21.9",
      warnings,
    });
    expect(loaderCalls).toEqual([]);
    expect(warnings.join(" ")).toMatch(/Fabric loader targets Minecraft 1\.21\.9[\s\S]*reinstall/);
  });
});

describe("applyModpackPlan — client-mod exclusion", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-excl-"));
    (globalThis as any).__mcSwaps = 0;
    downloadFixtures.clear();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("excludes an early-window-service jar and its required dependent, cleaning rows", async () => {
    const sodium = new AdmZip();
    sodium.addFile("META-INF/services/net.neoforged.neoforgespi.earlywindow.GraphicsBootstrapper", Buffer.from("x\n"));
    sodium.addFile("META-INF/neoforge.mods.toml", Buffer.from('[[mods]]\nmodId="sodium"\n'));
    const extra = new AdmZip();
    extra.addFile("META-INF/neoforge.mods.toml", Buffer.from('[[mods]]\nmodId="sodiumextra"\n\n[[dependencies.sodiumextra]]\nmodId="sodium"\ntype="required"\n'));
    const sodiumBytes = sodium.toBuffer();
    const extraBytes = extra.toBuffer();
    downloadFixtures.set("https://x/sodium.jar", sodiumBytes);
    downloadFixtures.set("https://x/sodium-extra.jar", extraBytes);

    const warnings: string[] = [];
    const result = await applyModpackPlan({
      plan: manualPlan({
        cfManifest: { manifestType: "minecraftModpack", manifestVersion: 1, name: "t", minecraft: { version: "1.21.1", modLoaders: [] }, files: [] },
        cfPlan: {
          files: [
            { id: 1, modId: 500, displayName: "Sodium", fileName: "sodium.jar", downloadUrl: "https://x/sodium.jar", hashes: [{ value: sha1Of(sodiumBytes), algo: 1 }], gameVersions: [], dependencies: [], isAvailable: true, fileLength: sodiumBytes.length },
            { id: 2, modId: 501, displayName: "Sodium Extra", fileName: "sodium-extra.jar", downloadUrl: "https://x/sodium-extra.jar", hashes: [{ value: sha1Of(extraBytes), algo: 1 }], gameVersions: [], dependencies: [], isAvailable: true, fileLength: extraBytes.length },
          ] as any,
          modNames: new Map(),
          skippedOptional: 0,
        },
        packLoader: null,
      }),
      serverId: "s1",
      serverRoot: root,
      serverMcVersion: "1.21.1",
      warnings,
    });

    expect(result.installedCount).toBe(0);
    expect(result.clientOnlyCount).toBe(2);
    expect(result.installedPackageIds).toEqual([]);
    expect(fs.existsSync(path.join(root, "mods", "500.jar"))).toBe(false);
    expect(fs.existsSync(path.join(root, "mods", "501.jar"))).toBe(false);
    expect(warnings.join(" ")).toMatch(/Excluded '500\.jar' — client-only rendering mod — it declares a client display service/);
    expect(warnings.join(" ")).toMatch(/Excluded '501\.jar' — requires sodium/);
    const deletes = prismaCalls.filter((c) => c.where?.packageId);
    expect(deletes.map((c) => c.where.packageId).sort()).toEqual(["500", "501"]);
  });

  it("installs a pack whose jar carries duplicated entry names (no install failure)", async () => {
    // adm-zip 0.6.1 rejects duplicate entry names lazily on first entries
    // access; a scan failure must never fail the whole install (regression:
    // "Modpack install failed ... Cause: ADM-ZIP: Duplicate entry name").
    const dupBytes = dupEntryJarBytes();
    downloadFixtures.set("https://x/dup.jar", dupBytes);

    const warnings: string[] = [];
    const result = await applyModpackPlan({
      plan: manualPlan({
        packLoader: null,
        cfManifest: { manifestType: "minecraftModpack", manifestVersion: 1, name: "t", minecraft: { version: "1.21.1", modLoaders: [] }, files: [] },
        cfPlan: {
          files: [
            { id: 3, modId: 502, displayName: "Shaded Lib Mod", fileName: "dup.jar", downloadUrl: "https://x/dup.jar", hashes: [{ value: sha1Of(dupBytes), algo: 1 }], gameVersions: [], dependencies: [], isAvailable: true, fileLength: dupBytes.length },
          ] as any,
          modNames: new Map(),
          skippedOptional: 0,
        },
      }),
      serverId: "s1",
      serverRoot: root,
      serverMcVersion: "1.21.1",
      warnings,
    });

    expect(result.installedCount).toBe(1);
    expect(fs.existsSync(path.join(root, "mods", "502.jar"))).toBe(true);
    expect(warnings.join(" ")).not.toMatch(/Excluded/);
  });
});

describe("applyModpackPlan — progress events", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "pack-progress-"));
    (globalThis as any).__mcSwaps = 0;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("walks mcswap → loader → overrides in order and reports the switch as a step", async () => {
    const events: any[] = [];
    await applyModpackPlan({
      plan: manualPlan({ mcSwitch: { from: "1.21.9", to: "1.21.1", jar: { url: "https://x", sha1: null, size: null } } }),
      serverId: "s1",
      serverRoot: root,
      serverMcVersion: "1.21.9",
      warnings: [],
      progress: (e) => events.push(e),
    });
    const stages = events.map((e) => e.stage).filter(Boolean);
    // De-duplicate consecutive repeats: each stage must be announced in order.
    const order = stages.filter((s, i) => i === 0 || s !== stages[i - 1]);
    expect(order).toEqual(["mcswap", "loader", "overrides"]);
    expect(events.find((e) => e.stage === "mcswap")).toMatchObject({ current: 0, total: 1, label: expect.stringContaining("1.21.1") });
    expect(events.find((e) => e.stage === "loader")?.label).toMatch(/NeoForge/);
  });

  it("a throwing progress callback never breaks the install", async () => {
    await expect(
      applyModpackPlan({
        plan: manualPlan({}),
        serverId: "s1",
        serverRoot: root,
        serverMcVersion: "1.21.1",
        warnings: [],
        progress: () => { throw new Error("ui gone"); },
      })
    ).resolves.toMatchObject({ installedCount: 0 });
  });
});
