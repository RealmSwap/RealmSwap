import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The node world-transfer planning layer: per-game validation refusals
 * (client-facing, matching the local route), and the BACKUP_RESTORE payload
 * each plan produces — destination rel dir + swap/overlay + tar layout.
 * The command queue and token registry are mocked.
 */

const bag = vi.hoisted(() => ({
  commands: [] as any[],
  outcome: { ok: true, output: "{}" as string },
  tokens: [] as any[],
  revoked: [] as string[],
}));

vi.mock("@/lib/agents/commands", () => ({
  resolveUsableNode: async () => ({ id: "node1", name: "nas" }),
  enqueueCommand: async (_nodeId: string, _serverId: string, type: string, payload: any) => {
    bag.commands.push({ type, payload });
    return { id: `cmd-${bag.commands.length}` };
  },
  awaitCommandResult: async () => bag.outcome,
}));
vi.mock("@/lib/agents/agentUploads", () => ({
  takeUpload: async () => ({ filePath: "/nonexistent.tar", nodeId: "node1", serverId: "srv", expiresAt: 0 }),
  issueDownloadToken: (filePath: string, nodeId: string, serverId: string) => {
    bag.tokens.push({ filePath, nodeId, serverId });
    return `tok-${bag.tokens.length}`;
  },
  revokeDownloadToken: (token: string) => bag.revoked.push(token),
  recordUpload: async () => "up1",
}));

import { planAgentWorldImport, importAgentWorld } from "@/lib/agents/agentWorlds";

describe("planAgentWorldImport", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-world-test-"));
    bag.commands = []; bag.tokens = []; bag.revoked = [];
    bag.outcome = { ok: true, output: "{}" };
  });

  it("Minecraft: refuses files and level.dat-less folders, swaps into world/", () => {
    expect(planAgentWorldImport("MINECRAFT", path.join(tmp, "w"), false).ok).toBe(false);
    const bad = fs.mkdtempSync(path.join(tmp, "bad-"));
    expect(planAgentWorldImport("MINECRAFT", bad, true).ok).toBe(false);
    expect(planAgentWorldImport("MINECRAFT", bad, true)).toMatchObject({
      ok: false, message: expect.stringContaining("level.dat"),
    });

    const good = fs.mkdtempSync(path.join(tmp, "good-"));
    fs.writeFileSync(path.join(good, "level.dat"), "x");
    expect(planAgentWorldImport("MINECRAFT", good, true)).toEqual({
      ok: true, plan: { destRelDir: "world", mode: "swap" },
    });
  });

  it("Valheim: collects .db/.fwl pairs from a folder, overlays into the container worlds dir", () => {
    const dir = fs.mkdtempSync(path.join(tmp, "vh-"));
    fs.writeFileSync(path.join(dir, "MyWorld.db"), "x");
    fs.writeFileSync(path.join(dir, "MyWorld.fwl"), "x");
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");
    const planned = planAgentWorldImport("VALHEIM", dir, true);
    expect(planned).toEqual({
      ok: true,
      plan: {
        destRelDir: "valheim-data/.config/IronGate/Valheim/worlds_local",
        mode: "overlay",
        files: ["MyWorld.db", "MyWorld.fwl"],
      },
    });
    expect(planAgentWorldImport("VALHEIM", tmp, true)).toMatchObject({
      ok: false, message: expect.stringContaining("No Valheim world files"),
    });
  });

  it("Zomboid demands a folder; Enshrouded/ARK allow dir (swap) or file (overlay)", () => {
    expect(planAgentWorldImport("ZOMBOID", tmp, false).ok).toBe(false);
    expect(planAgentWorldImport("ENSHROUDED", tmp, true)).toEqual({
      ok: true, plan: { destRelDir: "enshrouded-server/savegame", mode: "swap" },
    });
    const file = path.join(tmp, "save.sav");
    fs.writeFileSync(file, "x");
    expect(planAgentWorldImport("ENSHROUDED", file, false)).toEqual({
      ok: true, plan: { destRelDir: "enshrouded-server/savegame", mode: "overlay", files: ["save.sav"] },
    });
    expect(planAgentWorldImport("ARK", tmp, true)).toEqual({
      ok: true, plan: { destRelDir: "ark-server/ShooterGame/Saved/SavedArksLocal", mode: "swap" },
    });
  });
});

describe("importAgentWorld", () => {
  beforeEach(() => {
    bag.commands = []; bag.tokens = []; bag.revoked = [];
    bag.outcome = { ok: true, output: "{}" };
  });

  it("ships a swap import as a BACKUP_RESTORE with a one-shot token", async () => {
    const world = fs.mkdtempSync(path.join(os.tmpdir(), "agent-world-imp-"));
    fs.writeFileSync(path.join(world, "level.dat"), "x");
    await importAgentWorld("srv1", "MINECRAFT", world, true);

    expect(bag.commands).toHaveLength(1);
    expect(bag.commands[0].type).toBe("BACKUP_RESTORE");
    expect(bag.commands[0].payload).toMatchObject({
      kind: "BACKUP_RESTORE", dataDirName: "srv1", destRelDir: "world", mode: "swap",
    });
    expect(bag.commands[0].payload.downloadPath).toMatch(/^\/api\/agents\/download\/tok-1\?serverId=srv1$/);
    expect(bag.revoked).toEqual(["tok-1"]);
  });

  it("validation failures throw before any command is enqueued", async () => {
    await expect(importAgentWorld("srv1", "MINECRAFT", "nowhere", false)).rejects.toThrow(/folder/);
    expect(bag.commands).toEqual([]);
  });

  it("node failures surface with their message", async () => {
    const world = fs.mkdtempSync(path.join(os.tmpdir(), "agent-world-fail-"));
    fs.writeFileSync(path.join(world, "level.dat"), "x");
    bag.outcome = { ok: false, error: "Download failed: 404" } as any;
    await expect(importAgentWorld("srv1", "MINECRAFT", world, true)).rejects.toThrow(/Download failed/);
  });
});
