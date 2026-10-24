import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSync, mintNodeSecret, sha256Hex } from "@/lib/agents/auth";

// /api/agents/register + /api/agents/sync route guards: one-time enrollment,
// HMAC-rejected syncs, command result closure, claim→SENT handoff, and the
// signed response the agent must verify.

const bag = {
  nodes: {} as Record<string, any>,
  servers: [] as any[],
  commands: {} as Record<string, any>,
  claimed: [] as any[],
  completed: [] as any[],
  appliedReports: [] as any[],
  updates: [] as any[],
  markedSent: null as any,
};

vi.mock("@/lib/db", () => ({
  prisma: {
    agentNode: {
      findFirst: async ({ where }: any) =>
        Object.values(bag.nodes).find(
          (n: any) => where.enrollTokenHash && n.enrollTokenHash === where.enrollTokenHash && n.status === "PENDING"
        ) ?? null,
      findUnique: async ({ where }: any) => bag.nodes[where.id] ?? null,
      update: async ({ where, data }: any) => {
        bag.nodes[where.id] = { ...bag.nodes[where.id], ...data };
        bag.updates.push({ id: where.id, data });
        return bag.nodes[where.id];
      },
    },
    server: {
      findUnique: async () => bag.servers[0] ?? null,
      findMany: async () => bag.servers,
    },
    agentCommand: {
      findMany: async () => bag.claimed,
      updateMany: async ({ data }: any) => {
        bag.markedSent = data;
        return { count: bag.claimed.length };
      },
    },
  },
}));

vi.mock("@/lib/agents/commands", () => ({
  claimPendingCommands: async () => bag.claimed,
  completeCommand: async (id: string, ok: boolean, error?: string) => {
    bag.completed.push({ id, ok, error });
  },
}));

vi.mock("@/lib/agents/syncState", () => ({
  applyServerReport: async (report: any, node: any) => {
    bag.appliedReports.push({ report, node });
    return { applied: true };
  },
}));

import { POST as registerRoute } from "@/app/api/agents/register/route";
import { POST as syncRoute } from "@/app/api/agents/sync/route";

const secret = mintNodeSecret();

function nodeRow(overrides: Record<string, any> = {}) {
  return {
    id: "node-1", name: "Test Node", userId: "admin-1", status: "ACTIVE",
    secret, enrollTokenHash: null, enrollExpiresAt: null, ...overrides,
  };
}

function syncRequest(raw: string, nodeId = "node-1", nodeSecret = secret) {
  const ts = Date.now().toString();
  return new NextRequest("http://localhost/api/agents/sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-node-id": nodeId,
      "x-node-timestamp": ts,
      "x-node-signature": signSync(nodeSecret, nodeId, ts, raw),
    },
    body: raw,
  });
}

beforeEach(() => {
  bag.nodes = {};
  bag.servers = [];
  bag.claimed = [];
  bag.completed = [];
  bag.appliedReports = [];
  bag.updates = [];
  bag.markedSent = null;
});

describe("POST /api/agents/register", () => {
  it("exchanges a valid one-time token for node credentials and activates the node", async () => {
    const token = "a".repeat(32);
    bag.nodes["node-1"] = nodeRow({ status: "PENDING", enrollTokenHash: sha256Hex(token) });

    const res = await registerRoute(
      new NextRequest("http://localhost/api/agents/register", {
        method: "POST", body: JSON.stringify({ token }), headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nodeId).toBe("node-1");
    expect(data.nodeSecret).toMatch(/^[0-9a-f]{32}$/);
    expect(bag.nodes["node-1"].status).toBe("ACTIVE");
    expect(bag.nodes["node-1"].secret).toBe(data.nodeSecret);
    expect(bag.nodes["node-1"].enrollTokenHash).toBeNull();
  });

  it("rejects an unknown or already-used token", async () => {
    bag.nodes["node-1"] = nodeRow({ status: "ACTIVE", enrollTokenHash: null });
    const res = await registerRoute(
      new NextRequest("http://localhost/api/agents/register", {
        method: "POST", body: JSON.stringify({ token: "b".repeat(32) }), headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a missing token", async () => {
    const res = await registerRoute(
      new NextRequest("http://localhost/api/agents/register", {
        method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/agents/sync", () => {
  it("rejects a bad signature, unknown node, and revoked node", async () => {
    bag.nodes["node-1"] = nodeRow();
    const raw = JSON.stringify({ protocolVersion: 1, servers: [], results: [] });
    const req = syncRequest(raw, "node-1", "wrong-secret");
    const res = await syncRoute(req);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("bad_signature");

    bag.nodes = {};
    expect((await syncRoute(syncRequest(raw))).status).toBe(401);
    bag.nodes["node-1"] = nodeRow({ status: "REVOKED" });
    expect((await syncRoute(syncRequest(raw))).status).toBe(401);
  });

  it("updates the node heartbeat, applies reports, closes results, and returns claimed commands signed", async () => {
    bag.nodes["node-1"] = nodeRow();
    const payload = { kind: "START", dataDirName: "srv" };
    bag.claimed = [{ id: "cmd-9", type: "START", serverId: "srv", payload: JSON.stringify(payload) }];
    const raw = JSON.stringify({
      protocolVersion: 1,
      agentVersion: "1.0.0",
      platform: "linux",
      arch: "x64",
      dockerVersion: "27.0",
      lanIp: "192.168.1.50",
      totalRamMB: 16000,
      freeDiskGB: 400,
      servers: [{ serverId: "srv", status: "RUNNING" }],
      results: [{ commandId: "cmd-3", ok: false, error: "boom" }],
    });

    const res = await syncRoute(syncRequest(raw));
    expect(res.status).toBe(200);
    expect(bag.appliedReports).toEqual([
      { report: expect.objectContaining({ serverId: "srv" }), node: { id: "node-1", lanIp: "192.168.1.50" } },
    ]);
    expect(bag.completed).toEqual([{ id: "cmd-3", ok: false, error: "boom" }]);
    expect(bag.updates[0].data).toMatchObject({ status: "ACTIVE", platform: "linux", lanIp: "192.168.1.50" });

    const body = await res.json();
    expect(body.commands).toEqual([{ id: "cmd-9", type: "START", serverId: "srv", payload }]);
    expect(res.headers.get("x-node-resp-signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("closes a command whose payload JSON is corrupt instead of shipping it", async () => {
    bag.nodes["node-1"] = nodeRow();
    bag.claimed = [{ id: "cmd-x", type: "START", serverId: "srv", payload: "{not json" }];
    const raw = JSON.stringify({ protocolVersion: 1, servers: [], results: [] });
    const res = await syncRoute(syncRequest(raw));
    const body = await res.json();
    expect(body.commands).toHaveLength(0);
    expect(bag.completed).toEqual([{ id: "cmd-x", ok: false, error: expect.stringContaining("JSON") }]);
  });
});
