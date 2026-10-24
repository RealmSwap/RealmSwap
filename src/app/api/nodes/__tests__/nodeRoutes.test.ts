import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// /api/nodes route guards: member-readable list (no secrets), ADMIN-only
// enrollment minting, ADMIN-only revocation that strands servers honestly.

const bag = {
  user: null as any,
  nodes: [] as any[],
  created: null as any,
  servers: [] as any[],
  commandUpdates: null as any,
  serverUpdates: [] as any[],
};

vi.mock("@/lib/db", () => ({
  prisma: {
    agentNode: {
      findMany: async (args: any) =>
        bag.nodes.map((n: any) =>
          args?.select ? Object.fromEntries(Object.keys(args.select).map((k) => [k, n[k]])) : n
        ),
      create: async ({ data }: any) => {
        bag.created = { id: "node-new", ...data };
        return bag.created;
      },
      findUnique: async ({ where }: any) => bag.nodes.find((n) => n.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const n = bag.nodes.find((x) => x.id === where.id);
        Object.assign(n, data);
        return n;
      },
    },
    server: {
      findMany: async () => bag.servers,
      update: async ({ where, data }: any) => {
        bag.serverUpdates = bag.serverUpdates || [];
        bag.serverUpdates.push({ id: where.id, data });
        return { id: where.id };
      },
    },
    agentCommand: {
      updateMany: async ({ data }: any) => {
        bag.commandUpdates = data;
        return { count: 2 };
      },
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: async () => bag.user,
}));

vi.mock("@/lib/processMonitor", () => ({
  stopMonitoring: vi.fn(),
  clearStatsHistory: vi.fn(),
}));

import { GET as nodesGET, POST as nodesPOST } from "@/app/api/nodes/route";
import { DELETE as nodeDELETE } from "@/app/api/nodes/[id]/route";

beforeEach(() => {
  bag.user = { id: "admin-1", role: "ADMIN" };
  bag.nodes = [];
  bag.created = null;
  bag.servers = [];
  bag.commandUpdates = null;
  bag.serverUpdates = [];
});

describe("GET /api/nodes", () => {
  it("serves the list to any authed member with derived online flags and no secrets", async () => {
    bag.user = { id: "u9", role: "VIEWER" };
    bag.nodes = [
      { id: "n1", name: "NAS", status: "ACTIVE", platform: "linux", arch: "x64", agentVersion: "1.0.0", dockerVersion: "27", lanIp: "10.0.0.5", totalRamMB: 16000, freeDiskGB: 400, lastSeenAt: new Date(), createdAt: new Date(), secret: "should-not-leave", enrollTokenHash: "nope" },
      { id: "n2", name: "Pi", status: "PENDING", platform: null, arch: null, agentVersion: null, dockerVersion: null, lanIp: null, totalRamMB: null, freeDiskGB: null, lastSeenAt: null, createdAt: new Date() },
    ];
    const res = await nodesGET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nodes[0].online).toBe(true);
    expect(data.nodes[1].online).toBe(false);
    expect(JSON.stringify(data)).not.toContain("should-not-leave");
    expect(JSON.stringify(data)).not.toContain("enrollTokenHash");
  });

  it("requires auth", async () => {
    bag.user = null;
    expect((await nodesGET()).status).toBe(401);
  });
});

describe("POST /api/nodes", () => {
  it("mints an ADMIN enrollment: hashed token stored, plaintext returned once", async () => {
    const res = await nodesPOST(
      new NextRequest("http://localhost/api/nodes", {
        method: "POST", body: JSON.stringify({ name: "Synology" }), headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.enrollToken).toMatch(/^[0-9a-f]{32}$/);
    expect(bag.created.status).toBe("PENDING");
    // Stored form is a sha256 hex of the token, never the token itself.
    expect(bag.created.enrollTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(bag.created.enrollTokenHash).not.toBe(data.enrollToken);
  });

  it("is ADMIN-only", async () => {
    bag.user = { id: "u9", role: "VIEWER" };
    const res = await nodesPOST(
      new NextRequest("http://localhost/api/nodes", {
        method: "POST", body: JSON.stringify({ name: "X" }), headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects an empty name", async () => {
    const res = await nodesPOST(
      new NextRequest("http://localhost/api/nodes", {
        method: "POST", body: JSON.stringify({ name: "  " }), headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/nodes/[id]", () => {
  it("revokes the node, wipes credentials, and marks its AGENT servers CRASHED", async () => {
    bag.nodes = [{ id: "n1", name: "NAS", status: "ACTIVE", secret: "s", userId: "admin-1" }];
    bag.servers = [{ id: "srv", name: "Rust", status: "RUNNING" }];

    const res = await nodeDELETE(
      new NextRequest("http://localhost/api/nodes/n1", { method: "DELETE" }),
      { params: { id: "n1" } },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ revoked: true, serversAffected: 1 });
    expect(bag.nodes[0].status).toBe("REVOKED");
    expect(bag.nodes[0].secret).toBeNull();
    expect(bag.serverUpdates[0]).toEqual({ id: "srv", data: { status: "CRASHED", pid: null } });
    expect(bag.commandUpdates).toMatchObject({ status: "FAILED" });
  });

  it("is ADMIN-only and 404s unknown nodes", async () => {
    bag.user = { id: "u9", role: "MODERATOR" };
    const res = await nodeDELETE(
      new NextRequest("http://localhost/api/nodes/n1", { method: "DELETE" }),
      { params: { id: "n1" } },
    );
    expect(res.status).toBe(403);

    bag.user = { id: "admin-1", role: "ADMIN" };
    const missing = await nodeDELETE(
      new NextRequest("http://localhost/api/nodes/none", { method: "DELETE" }),
      { params: { id: "none" } },
    );
    expect(missing.status).toBe(404);
  });
});
