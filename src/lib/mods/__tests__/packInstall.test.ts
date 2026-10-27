import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { planModpackFromZip, applyModpackPlan, type ModpackPlan } from "../packInstall";

const prismaCalls: any[] = [];
vi.mock("@/lib/db", () => ({
  prisma: {
    modInstallation: {
      findMany: async () => [],
      upsert: async (args: any) => {
        prismaCalls.push(args);
        return {};
      },
      deleteMany: async () => ({}),
    },
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
