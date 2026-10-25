import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";

// The agent backup flows, integration-style: real temp dirs, real system tar,
// real adm-zip, real upload registry — only prisma, the command queue, RCON,
// and notifications are mocked. This proves the zip shapes stay identical to
// the local flow (save-dir contents at the zip root), which is what backup
// verification and restore depend on.

const bag = {
  server: null as any,
  servers: [] as any[],
  nodes: {} as Record<string, any>,
  createdBackups: [] as any[],
  backupUpdates: [] as any[],
  serverUpdates: [] as any[],
  activityLogs: [] as any[],
  enqueued: [] as any[],
  awaitOutcome: { ok: true, output: "" } as any,
  uploadId: "",
};

vi.mock("@/lib/db", () => ({
  prisma: {
    server: {
      findUnique: async () => bag.server,
      update: async ({ where, data }: any) => {
        bag.serverUpdates.push({ id: where.id, data });
        return { id: where.id };
      },
    },
    backup: {
      create: async ({ data }: any) => {
        const row = { id: `bk-${bag.createdBackups.length + 1}`, ...data };
        bag.createdBackups.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        bag.backupUpdates.push({ id: where.id, data });
        const row = bag.createdBackups.find((b) => b.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      findMany: async () => [],
      delete: async () => ({}) },
    agentNode: {
      findUnique: async ({ where }: any) => bag.nodes[where.id] ?? null,
    },
    activityLog: {
      create: async ({ data }: any) => {
        bag.activityLogs.push(data);
        return { id: "log1" };
      },
    },
  },
}));

vi.mock("../agents/commands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/commands")>();
  return {
    ...actual,
    enqueueCommand: async (...args: any[]) => {
      bag.enqueued.push(args);
      return { id: "cmd-1" };
    },
    awaitCommandResult: async () => bag.awaitOutcome,
  };
});

vi.mock("../rconManager", () => ({
  rconManager: { execute: async () => "ok" },
}));

vi.mock("../notifications", () => ({
  sendNotification: async () => {},
}));

vi.mock("../mods/reconcile", () => ({
  reconcileInstalledMods: async () => [],
}));

vi.mock("../offsiteBackup", () => ({
  startOffsiteUpload: vi.fn(),
}));

vi.mock("@/lib/gameHost", () => ({
  resolveGameHost: async () => "127.0.0.1",
}));

import { createBackup, restoreBackup } from "../backupService";
import { recordUpload, takeUpload } from "../agents/agentUploads";

function agentServer(overrides: Record<string, any> = {}) {
  return {
    id: "srv", userId: "u1", name: "Valheim Server", game: "VALHEIM",
    runnerType: "AGENT", nodeId: "node-1", port: 2456, status: "STOPPED",
    definitionId: "def1", password: "pw", ramAllocation: 6, paramValues: null,
    ...overrides,
  };
}

function onlineNode() {
  return { id: "node-1", name: "NAS", status: "ACTIVE", secret: "s", lastSeenAt: new Date() };
}

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-backup-test-"));
  bag.server = agentServer();
  bag.nodes = { "node-1": onlineNode() };
  bag.createdBackups = [];
  bag.backupUpdates = [];
  bag.serverUpdates = [];
  bag.activityLogs = [];
  bag.enqueued = [];
  bag.uploadId = "";
  bag.awaitOutcome = { ok: true, output: "" };
});

/** Stage a tar the way the agent's upload endpoint would, and point the
 *  command outcome at it. valheim=true roots the tar at the worlds dir. */
async function stageAgentUpload(valheim: boolean, srcRelDir: string, worldFiles: Record<string, string>): Promise<void> {
  const dataDir = path.join(tmp, "agent-data", "srv");
  const srcAbs = path.join(dataDir, srcRelDir);
  fs.mkdirSync(srcAbs, { recursive: true });
  for (const [name, content] of Object.entries(worldFiles)) {
    fs.writeFileSync(path.join(srcAbs, name), content);
  }
  const tarPath = path.join(tmp, "staged-upload.tar");
  const { execFileSync } = await import("child_process");
  if (valheim) {
    execFileSync("tar", ["-cf", tarPath, "-C", srcAbs, ...Object.keys(worldFiles)]);
  } else {
    execFileSync("tar", ["-cf", tarPath, "-C", dataDir, srcRelDir]);
  }
  bag.uploadId = recordUpload(tarPath, "node-1", "srv");
  bag.awaitOutcome = { ok: true, output: JSON.stringify({ uploadId: bag.uploadId }) };
}

describe("createBackup for AGENT servers (Valheim)", () => {
  it("commands a BACKUP_CREATE with the docker-layout relDir, then assembles a verified zip", async () => {
    await stageAgentUpload(true, "valheim-data/.config/IronGate/Valheim/worlds_local", {
      "Dedicated.db": "fake-world-db",
      "Dedicated.fwl": "fake-world-fwl",
    });

    const backup = await createBackup("srv", "MANUAL", "Node Snapshot");

    const [nodeId, serverId, type, payload] = bag.enqueued[0];
    expect(type).toBe("BACKUP_CREATE");
    expect(nodeId).toBe("node-1");
    expect(payload).toMatchObject({
      kind: "BACKUP_CREATE",
      dataDirName: "srv",
      srcRelDir: "valheim-data/.config/IronGate/Valheim/worlds_local",
      includeFiles: ["Dedicated.db", "Dedicated.fwl"],
      uploadPath: "/api/agents/upload?serverId=srv",
    });

    // The created zip has the same shape as the local flow: Dedicated.* at root.
    expect(bag.createdBackups).toHaveLength(1);
    const zipRow = bag.backupUpdates.find((u) => u.data.filePath)?.data;
    expect(zipRow.filePath).toMatch(/\.zip$/);
    const zip = new AdmZip(zipRow.filePath);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain("Dedicated.db");
    expect(names).toContain("Dedicated.fwl");
    expect(zip.readAsText("Dedicated.db")).toBe("fake-world-db");

    // Verification ran and passed (verifiedAt stamped).
    const verifyUpdate = bag.backupUpdates.find((u) => "verifiedAt" in u.data);
    expect(verifyUpdate.data.verifiedAt).toBeTruthy();
    expect(backup.id).toBe("bk-1");
    // The upload was consumed exactly once.
    expect(takeUpload(bag.uploadId, "node-1", "srv")).toBeNull();
  });

  it("fails honestly when the agent reports no world files", async () => {
    bag.awaitOutcome = { ok: false, error: "No world files found to back up — start the server once to generate a world." };
    await expect(createBackup("srv", "MANUAL")).rejects.toThrow(/No world files found/);
    expect(bag.createdBackups).toHaveLength(0);
  });

  it("fails honestly when the agent finishes without delivering an upload", async () => {
    bag.awaitOutcome = { ok: true, output: JSON.stringify({}) };
    await expect(createBackup("srv", "MANUAL")).rejects.toThrow(/without delivering the archive/);
    expect(bag.createdBackups).toHaveLength(0);
  });

  it("refuses to run when the node is offline", async () => {
    bag.nodes = { "node-1": { ...onlineNode(), lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) } };
    await expect(createBackup("srv", "MANUAL")).rejects.toThrow(/offline/);
    expect(bag.enqueued).toHaveLength(0);
  });
});

describe("restoreBackup for AGENT servers", () => {
  it("verifies the zip, stages a tar, and commands the agent with a one-shot token", async () => {
    // Build the Backup row + a real verified zip (Dedicated files at root).
    const zip = new AdmZip();
    zip.addFile("Dedicated.db", Buffer.from("restored-db"));
    zip.addFile("Dedicated.fwl", Buffer.from("restored-fw"));
    const zipPath = path.join(tmp, "backup.zip");
    zip.writeZip(zipPath);

    bag.server = agentServer();
    (bag as any).backupRow = {
      id: "bk-9", serverId: "srv", userId: "u1", name: "Node Snapshot",
      game: "VALHEIM", filePath: zipPath, offsiteStatus: null,
      server: agentServer(),
    };

    // restoreBackup fetches backup.include server via prisma.backup.findUnique —
    // our mock's backup model has no findUnique; route through createBackup's
    // row instead by patching the mock at runtime.
    const dbModule = await import("@/lib/db");
    (dbModule.prisma as any).backup.findUnique = async () => (bag as any).backupRow;

    await restoreBackup("bk-9");

    const [nodeId, serverId, type, payload] = bag.enqueued[0];
    expect(type).toBe("BACKUP_RESTORE");
    expect(nodeId).toBe("node-1");
    expect(payload).toMatchObject({
      kind: "BACKUP_RESTORE",
      dataDirName: "srv",
      destRelDir: "valheim-data/.config/IronGate/Valheim/worlds_local",
      mode: "overlay",
    });
    expect(payload.downloadPath).toMatch(/^\/api\/agents\/download\/[0-9a-f]{32}\?serverId=srv$/);
    expect(bag.activityLogs[0].action).toBe("RESTORE_SERVER");
  });
});
