import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The remote (AGENT-node) install path's decision points, with every
 * boundary mocked: node file I/O (agentFiles), file shipping + container
 * runs (agentMods), provider APIs (modrinth), and prisma rows. What's under
 * test: marker parsing, version detection precedence, ini semantics on the
 * remote path, ship payloads (deletes/backupPaths), and honest refusals.
 */

const bag = vi.hoisted(() => ({
  files: new Map<string, string>(),
  listed: new Map<string, { name: string; isDir: boolean }[]>(),
  reads: [] as any[],
  writes: [] as any[],
  lists: [] as string[],
  ships: [] as any[],
  containerRuns: [] as any[],
  scans: [] as any[],
  rollbacks: [] as any[],
  upserts: [] as any[],
  downloadBody: new Map<string, Buffer>(),
  resolveCandidate: null as any,
  containerOutput: "",
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    get modInstallation() {
      return {
        findMany: async () => [],
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
    const body = bag.downloadBody.get(url);
    if (!body) throw new Error(`No test download body for ${url}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, body);
  },
}));

vi.mock("@/lib/agents/agentFiles", () => ({
  agentReadServerFile: async (_serverId: string, relPath: string) => {
    bag.reads.push(relPath);
    if (bag.files.has(relPath)) return { exists: true, content: bag.files.get(relPath)! };
    return { exists: false, content: null };
  },
  agentWriteServerFile: async (_serverId: string, relPath: string, content: string, opts?: any) => {
    bag.writes.push({ relPath, content, opts });
    bag.files.set(relPath, content);
  },
  agentListServerDir: async (_serverId: string, relPath: string) => {
    bag.lists.push(relPath);
    return bag.listed.get(relPath) ?? [];
  },
}));

vi.mock("@/lib/agents/agentMods", () => ({
  shipModTree: async (serverId: string, stagingRoot: string, opts: any) => {
    bag.ships.push({ serverId, stagingRoot, opts, layout: walkLayout(stagingRoot) });
    return { snapshotId: "snap-1" };
  },
  makeModStagingRoot: async (serverId: string) => fs.mkdtempSync(path.join(os.tmpdir(), `rs-ri-test-${serverId}-`)),
  runNodeContainer: async (serverId: string, image: string, cmd: string, timeoutMs?: number) => {
    bag.containerRuns.push({ serverId, image, cmd, timeoutMs });
    return bag.containerOutput;
  },
  scanNodeFiles: async (serverId: string, relDir: string, fileName: string, patterns: any[]) => {
    bag.scans.push({ relDir, fileName, patterns });
    return [
      { relPath: `${relDir}/CommonSense/mod.info`, fields: { id: "BB_CommonSense", name: "Common Sense" } },
    ];
  },
  rollbackAgentModShip: async (serverId: string, snapshotId: string, clearPaths: string[]) => {
    bag.rollbacks.push({ snapshotId, clearPaths });
  },
  snapshotNodePaths: async () => "pathsnap-1",
}));

vi.mock("@/lib/mods/modrinth", () => ({
  resolveInstallCandidate: async (...a: any[]) => bag.resolveCandidate(...a),
  fetchVersions: async () => [],
  pickCompatibleVersion: async () => null,
  primaryFile: (v: any) => v.files?.[0] ?? null,
  collectRequiredDependencies: async () => ({ order: [], missingProjects: [] }),
}));

import {
  readRemoteLoaderMarker, detectRemoteMinecraftVersion,
  installArkWorkshopModRemote, installZomboidWorkshopModRemote,
  resolveRemoteModUpdate,
} from "@/lib/mods/remoteInstallers";

function walkLayout(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkLayout(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

const validMarker = {
  type: "fabric",
  loaderVersion: "0.16.9",
  minecraftVersion: "1.21.1",
  installedAt: new Date().toISOString(),
  launch: { kind: "jar", file: "fabric-server-launch.jar" },
};

describe("readRemoteLoaderMarker", () => {
  beforeEach(() => {
    bag.files.clear(); bag.reads = []; bag.writes = []; bag.lists = [];
    bag.ships = []; bag.containerRuns = []; bag.scans = []; bag.rollbacks = []; bag.upserts = [];
  });

  it("parses the node's marker", async () => {
    bag.files.set("realmswap-loader.json", JSON.stringify(validMarker));
    expect(await readRemoteLoaderMarker("srv")).toMatchObject({ type: "fabric" });
  });

  it("returns null for missing and corrupt markers", async () => {
    expect(await readRemoteLoaderMarker("srv")).toBeNull();
    bag.files.set("realmswap-loader.json", "{not json");
    expect(await readRemoteLoaderMarker("srv")).toBeNull();
  });
});

describe("detectRemoteMinecraftVersion", () => {
  beforeEach(() => {
    bag.files.clear(); bag.containerRuns = []; bag.writes = []; bag.reads = []; bag.lists = [];
    bag.ships = []; bag.scans = []; bag.rollbacks = []; bag.upserts = [];
  });

  it("prefers the marker's pinned version without touching a container", async () => {
    bag.files.set("realmswap-loader.json", JSON.stringify(validMarker));
    expect(await detectRemoteMinecraftVersion("srv")).toBe("1.21.1");
    expect(bag.containerRuns).toEqual([]);
  });

  it("vanilla servers: extracts version.json from server.jar via a throwaway JDK container", async () => {
    bag.containerOutput = '{"id":"1.21.4","name":"x"}';
    const version = await detectRemoteMinecraftVersion("srv");
    expect(version).toBe("1.21.4");
    expect(bag.containerRuns).toHaveLength(1);
    expect(bag.containerRuns[0].cmd).toContain("version.json");
  });
});

describe("installArkWorkshopModRemote", () => {
  beforeEach(() => {
    bag.files.clear(); bag.containerRuns = []; bag.writes = []; bag.reads = []; bag.lists = [];
    bag.ships = []; bag.scans = []; bag.rollbacks = []; bag.upserts = [];
  });

  it("edits ActiveMods= in the sectioned ini over the file commands and records the row", async () => {
    bag.files.set(
      "ark-server/ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini",
      "[ServerSettings]\nActiveMods=111\n"
    );
    await installArkWorkshopModRemote({ serverId: "srv", workshopId: "2875848298", name: "CommonSense" });

    expect(bag.writes).toHaveLength(1);
    expect(bag.writes[0].relPath).toBe("ark-server/ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini");
    expect(bag.writes[0].content).toContain("ActiveMods=111,2875848298");
    expect(bag.writes[0].opts).toEqual({ backup: true });
    expect(bag.upserts[0].where).toEqual({
      serverId_provider_packageId: { serverId: "srv", provider: "workshop", packageId: "2875848298" },
    });
  });

  it("creates a fresh [ServerSettings] when the ini doesn't exist yet", async () => {
    await installArkWorkshopModRemote({ serverId: "srv", workshopId: "42" });
    expect(bag.writes[0].content).toBe("[ServerSettings]\nActiveMods=42\n");
  });
});

describe("installZomboidWorkshopModRemote", () => {
  beforeEach(() => {
    bag.files.clear(); bag.containerRuns = []; bag.writes = []; bag.reads = []; bag.lists = [];
    bag.ships = []; bag.scans = []; bag.rollbacks = []; bag.upserts = [];
  });

  it("with a modId: pure ini edit, no SteamCMD run, row carries the mod id", async () => {
    await installZomboidWorkshopModRemote({ serverId: "srv", workshopId: "2875848298", modId: "BB_CommonSense" });
    expect(bag.containerRuns).toEqual([]);
    expect(bag.writes[0].relPath).toBe("zomboid-server/zomboid-data/Server/servertest.ini");
    expect(bag.writes[0].content).toContain("WorkshopItems=2875848298");
    expect(bag.writes[0].content).toContain("Mods=BB_CommonSense");
    expect(bag.upserts[0].create.workshopModId).toBe("BB_CommonSense");
  });

  it("without a modId: SteamCMD downloads on the node, ids derived from mod.info", async () => {
    await installZomboidWorkshopModRemote({ serverId: "srv", workshopId: "2875848298" });
    expect(bag.containerRuns).toHaveLength(1);
    expect(bag.containerRuns[0].cmd).toContain("+workshop_download_item 108600 2875848298");
    expect(bag.scans).toEqual([
      {
        relDir: "zomboid-server/steamapps/workshop/content/108600/2875848298",
        fileName: "mod.info",
        patterns: [
          { key: "id", regex: "^id=(.+)$" },
          { key: "name", regex: "^name=(.+)$" },
        ],
      },
    ]);
    expect(bag.writes[0].content).toContain("Mods=BB_CommonSense");
    expect(bag.upserts[0].create.workshopModId).toBe("BB_CommonSense");
    expect(bag.upserts[0].create.name).toBe("Common Sense");
  });
});

describe("resolveRemoteModUpdate", () => {
  beforeEach(() => {
    bag.files.clear(); bag.containerRuns = []; bag.writes = []; bag.reads = []; bag.lists = [];
    bag.ships = []; bag.scans = []; bag.rollbacks = []; bag.upserts = [];
    bag.downloadBody.set("https://cdn.modrinth.test/file.jar", Buffer.from("jar"));
  });

  it("modrinth: resolves the newest compatible version and ships the single jar with mods rollback", async () => {
    bag.files.set("realmswap-loader.json", JSON.stringify(validMarker));
    bag.resolveCandidate = async () => ({
      project: { id: "sodium", title: "Sodium", server_side: "required" },
      version: { version_number: "0.6.0" },
      file: { url: "https://cdn.modrinth.test/file.jar" },
    });

    const resolved = await resolveRemoteModUpdate(
      { provider: "modrinth", packageId: "sodium", version: "0.5.0", name: "Sodium" },
      "MINECRAFT",
      "srv"
    );
    expect(resolved.newVersionNumber).toBe("0.6.0");
    await resolved.applyUpdate();

    expect(bag.ships).toHaveLength(1);
    expect(bag.ships[0].opts).toEqual({ deletes: ["mods/sodium.jar"], backupPaths: ["mods"] });
    expect(bag.ships[0].layout).toEqual(["mods/sodium.jar"]);
  });

  it("ARK workshop rows refuse with the restart-the-server guidance", async () => {
    await expect(
      resolveRemoteModUpdate({ provider: "workshop", packageId: "42", version: "Workshop" }, "ARK", "srv")
    ).rejects.toThrow(/-automanagemods/);
  });

  it("unsupported provider/game pairs refuse with a client-facing error", async () => {
    await expect(
      resolveRemoteModUpdate({ provider: "thunderstore", packageId: "x-y-1.0.0", version: "1.0.0" }, "MINECRAFT", "srv")
    ).rejects.toThrow(/Valheim and V Rising/);
  });
});
