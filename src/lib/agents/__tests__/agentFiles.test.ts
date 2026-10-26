import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * agentFiles: the dashboard-side wrapper that ferries small-file operations
 * to a node over the command queue. The queue primitives are mocked; what's
 * under test is payload shape, result parsing, and error honesty.
 */

const bag = vi.hoisted(() => ({
  node: { id: "node1", name: "garage-nas" },
  enqueued: [] as any[],
  outcome: { ok: true, output: "{}", status: "DONE" } as { ok: boolean; error?: string; output?: string; status: "DONE" | "FAILED" | "TIMEOUT" },
}));

vi.mock("@/lib/agents/commands", () => ({
  resolveUsableNode: async () => bag.node,
  enqueueCommand: async (nodeId: string, serverId: string, type: string, payload: any) => {
    bag.enqueued.push({ nodeId, serverId, type, payload });
    return { id: `cmd-${bag.enqueued.length}` };
  },
  awaitCommandResult: async () => bag.outcome,
}));

import {
  agentReadServerFile,
  agentListServerDir,
  agentWriteServerFile,
  agentApplyConfigFiles,
} from "@/lib/agents/agentFiles";

describe("agentFiles", () => {
  beforeEach(() => {
    bag.enqueued = [];
    bag.outcome = { ok: true, output: "{}", status: "DONE" };
  });

  it("reads a file: FILE_READ with dataDirName = serverId, parses the output JSON", async () => {
    bag.outcome = { ok: true, output: JSON.stringify({ exists: true, content: "motd=hi\n" }), status: "DONE" };
    const result = await agentReadServerFile("srv1", "mc-server/server.properties");
    expect(result).toEqual({ exists: true, content: "motd=hi\n" });
    expect(bag.enqueued[0]).toEqual({
      nodeId: "node1",
      serverId: "srv1",
      type: "FILE_READ",
      payload: { kind: "FILE_READ", dataDirName: "srv1", relPath: "mc-server/server.properties" },
    });
  });

  it("lists a directory and filters to the entries array", async () => {
    bag.outcome = {
      ok: true,
      output: JSON.stringify({ entries: [{ name: "a.toml", isDir: false }, { name: "sub", isDir: true }] }),
      status: "DONE",
    };
    const entries = await agentListServerDir("srv1", "config");
    expect(entries).toEqual([{ name: "a.toml", isDir: false }, { name: "sub", isDir: true }]);
    expect(bag.enqueued[0].payload).toEqual({ kind: "FILE_LIST", dataDirName: "srv1", relPath: "config" });
  });

  it("writes a file with the backup flag and forwards failures honestly", async () => {
    await agentWriteServerFile("srv1", "server.properties", "motd=new\n", { backup: true });
    expect(bag.enqueued[0].payload).toEqual({
      kind: "FILE_WRITE", dataDirName: "srv1", relPath: "server.properties",
      content: "motd=new\n", backup: true,
    });

    bag.outcome = { ok: false, error: "File path escapes the server data dir", status: "FAILED" };
    await expect(agentWriteServerFile("srv1", "../evil", "x")).rejects.toThrow(/escapes/);
  });

  it("applies config sets via CONFIG_APPLY with merge annotations intact", async () => {
    const files = [
      { relPath: "zomboid-server/zomboid-data/Server/servertest.ini", content: "Password=p\n", merge: true },
      { relPath: "enshrouded-server/enshrouded_server.json", content: "{}" },
    ];
    await agentApplyConfigFiles("srv1", files);
    expect(bag.enqueued[0].payload).toEqual({ kind: "CONFIG_APPLY", dataDirName: "srv1", files });
  });

  it("rejects an unreadable result payload instead of guessing", async () => {
    bag.outcome = { ok: true, output: "not-json{", status: "DONE" };
    await expect(agentReadServerFile("srv1", "x")).rejects.toThrow(/unreadable FILE_READ/);
  });
});
