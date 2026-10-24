import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level guards for the status-surface routes added with the real Disk
 * tile, the real Network row and the public status page. Boundary modules
 * (auth, prisma, disk walk, connectivity checks, tunnels) are mocked; the
 * routes' auth gates, shape and selection logic are what's under test.
 *
 * Auth classes pinned here:
 *  - /disk and /network-status: any server member (VIEWER+) — no credentials
 *    in the response.
 *  - /status-share: ADMIN only (it decides what anonymous visitors can see).
 */

const bag = vi.hoisted(() => ({
  user: { id: "user1" } as any,
  access: { server: { id: "s1", name: "Test Server", statusShareCode: null, definitionId: "def1", status: "RUNNING", port: 25565, tunnelUrl: null, enableUpnp: false, tunnelEnabled: false, game: "MINECRAFT" }, isOwner: true } as any,
  diskBytes: 3.5 * 1024 * 1024 * 1024 as number | null,
  freeGB: 41.2,
  historyRows: [] as any[],
  def: { id: "def1", spec: "{}" } as any,
  tunnelAlive: true,
  report: {
    overall: "ready",
    checks: [
      { id: "server", label: "Server status", status: "ok", detail: "ok" },
      { id: "listen", label: "Game is listening", status: "ok", detail: "ok" },
      { id: "router", label: "Router / outside access", status: "ok", detail: "ok" },
      { id: "firewall", label: "Windows Firewall", status: "skip", detail: "n/a" },
    ],
  } as any,
  connectivityArgs: null as any,
  updated: [] as any[],
  audit: [] as any[],
  findUniqueResult: null as any,
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => bag.user }));
vi.mock("@/lib/serverAuth", () => ({
  verifyServerAccess: async (_serverId: string, _userId: string, required?: string) => {
    if (required === "ADMIN" && !bag.access?.isOwner) return null;
    return bag.access;
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    get serverTelemetry() {
      return { findMany: async () => bag.historyRows };
    },
    get gameDefinition() {
      return { findUnique: async () => bag.def, findFirst: async () => bag.def };
    },
    get server() {
      return {
        update: async (args: any) => {
          bag.updated.push(args);
          return {};
        },
        findUnique: async () => bag.findUniqueResult,
      };
    },
    get activityLog() {
      return { create: async (args: any) => { bag.audit.push(args.data); return {}; } };
    },
  },
}));
vi.mock("@/lib/diskUsage", () => ({
  getServerDiskBytes: async () => bag.diskBytes,
  bytesToGB: (bytes: number | null) => (bytes === null ? null : Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100),
}));
vi.mock("@/lib/preflight", () => ({
  getFreeDiskSpaceGB: async () => bag.freeGB,
}));
vi.mock("@/lib/definitions/serialize", () => ({
  parseSpec: (spec: string) => JSON.parse(spec || "{}"),
}));
vi.mock("@/lib/connectivityCheck", () => ({
  runConnectivityChecks: async (server: any, spec: any, deps: any) => {
    bag.connectivityArgs = { server, spec, deps };
    return bag.report;
  },
}));
vi.mock("@/lib/tunnels", () => ({
  isTunnelAlive: () => bag.tunnelAlive,
}));

import { GET as diskGET } from "@/app/api/servers/[id]/disk/route";
import { GET as networkGET } from "@/app/api/servers/[id]/network-status/route";
import { POST as sharePOST } from "@/app/api/servers/[id]/status-share/route";

const req = (url: string, init: any = {}) => new NextRequest(`http://localhost${url}`, init);
const params = { id: "s1" };

beforeEach(() => {
  bag.user = { id: "user1" };
  bag.access = { server: { id: "s1", name: "Test Server", statusShareCode: null, definitionId: "def1", status: "RUNNING", port: 25565, tunnelUrl: null, enableUpnp: false, tunnelEnabled: false, game: "MINECRAFT" }, isOwner: true };
  bag.diskBytes = 3.5 * 1024 * 1024 * 1024;
  bag.freeGB = 41.2;
  bag.historyRows = [];
  bag.def = { id: "def1", spec: "{}" };
  bag.tunnelAlive = true;
  bag.updated = [];
  bag.audit = [];
  bag.findUniqueResult = null;
  bag.connectivityArgs = null;
  bag.report = {
    overall: "ready",
    checks: [
      { id: "server", label: "Server status", status: "ok", detail: "ok" },
      { id: "listen", label: "Game is listening", status: "ok", detail: "ok" },
      { id: "router", label: "Router / outside access", status: "ok", detail: "ok" },
      { id: "firewall", label: "Windows Firewall", status: "skip", detail: "n/a" },
    ],
  };
});

describe("GET /api/servers/[id]/disk", () => {
  it("rejects unauthenticated callers", async () => {
    bag.user = null;
    const res = await diskGET(req("/api/servers/s1/disk"), { params });
    expect(res.status).toBe(401);
  });

  it("rejects non-members", async () => {
    bag.access = null;
    const res = await diskGET(req("/api/servers/s1/disk"), { params });
    expect(res.status).toBe(403);
  });

  it("returns the real folder size, free space and deduped history", async () => {
    bag.historyRows = [{ diskMB: 300 }, { diskMB: 300 }, { diskMB: 450 }, { diskMB: 450 }, { diskMB: 600 }];
    const res = await diskGET(req("/api/servers/s1/disk"), { params });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ folderGB: 3.5, freeGB: 41.2, history: [600, 450, 300] });
  });

  it("says so honestly when there is no local folder", async () => {
    bag.diskBytes = null;
    const res = await diskGET(req("/api/servers/s1/disk"), { params });
    const data = await res.json();
    expect(data.folderGB).toBeNull();
    expect(data.freeGB).toBeNull(); // free space would describe the host, not the server
    expect(data.history).toEqual([]);
  });
});

describe("GET /api/servers/[id]/network-status", () => {
  it("rejects unauthenticated callers and non-members", async () => {
    bag.user = null;
    expect((await networkGET(req("/api/servers/s1/network-status"), { params })).status).toBe(401);
    bag.user = { id: "user1" };
    bag.access = null;
    expect((await networkGET(req("/api/servers/s1/network-status"), { params })).status).toBe(403);
  });

  it("returns the verdict, the first real issue and tunnel liveness", async () => {
    bag.report = {
      overall: "blocked",
      checks: [
        { id: "server", label: "Server status", status: "ok", detail: "ok" },
        { id: "listen", label: "Game is listening", status: "fail", detail: "Nothing is listening on port 25565 yet." },
        { id: "router", label: "Router / outside access", status: "warn", detail: "Neither a tunnel nor UPnP is active." },
        { id: "firewall", label: "Windows Firewall", status: "skip", detail: "n/a" },
      ],
    };
    const res = await networkGET(req("/api/servers/s1/network-status"), { params });
    const data = await res.json();
    expect(data).toEqual({
      available: true,
      overall: "blocked",
      issue: { label: "Game is listening", detail: "Nothing is listening on port 25565 yet." },
      tunnelAlive: true,
    });
    // The liveness map must reach the checks — the default dep reports every
    // tunnel dead (the exact bug that made the old row trustworthy-looking).
    expect(typeof bag.connectivityArgs.deps.tunnelAlive).toBe("function");
    expect(bag.connectivityArgs.deps.tunnelAlive("s1")).toBe(true);
  });

  it("never lets the advisory firewall warning become the headline issue", async () => {
    bag.report = {
      overall: "ready",
      checks: [
        { id: "server", label: "Server status", status: "ok", detail: "ok" },
        { id: "listen", label: "Game is listening", status: "ok", detail: "ok" },
        { id: "router", label: "Router / outside access", status: "ok", detail: "ok" },
        { id: "firewall", label: "Windows Firewall", status: "warn", detail: "Can't verify the firewall automatically." },
      ],
    };
    const res = await networkGET(req("/api/servers/s1/network-status"), { params });
    const data = await res.json();
    expect(data.overall).toBe("ready");
    expect(data.issue).toBeNull();
  });

  it("degrades gracefully for an unsupported game", async () => {
    bag.def = null;
    const res = await networkGET(req("/api/servers/s1/network-status"), { params });
    const data = await res.json();
    expect(data).toEqual({ available: false });
  });
});

describe("POST /api/servers/[id]/status-share", () => {
  const post = (body: any) =>
    sharePOST(req("/api/servers/s1/status-share", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }), { params });

  it("rejects unauthenticated callers", async () => {
    bag.user = null;
    expect((await post({ action: "enable" })).status).toBe(401);
  });

  it("is ADMIN-only — a VIEWER/MODERATOR member gets 403", async () => {
    bag.access = { server: bag.access.server, isOwner: false };
    expect((await post({ action: "enable" })).status).toBe(403);
    expect(bag.updated).toHaveLength(0);
  });

  it("enable is idempotent when a code already exists", async () => {
    bag.access.server.statusShareCode = "existing1";
    const res = await post({ action: "enable" });
    const data = await res.json();
    expect(data.code).toBe("existing1");
    expect(bag.updated).toHaveLength(1);
    expect(bag.updated[0].data.statusShareCode).toBe("existing1");
  });

  it("enable generates an 8-hex code and audits the action", async () => {
    const res = await post({ action: "enable" });
    const data = await res.json();
    expect(data.code).toMatch(/^[0-9a-f]{8}$/);
    expect(bag.updated[0].data.statusShareCode).toBe(data.code);
    expect(bag.audit[0].action).toBe("STATUS_SHARE");
  });

  it("rotate always mints a fresh code", async () => {
    bag.access.server.statusShareCode = "old-code";
    const res = await post({ action: "rotate" });
    const data = await res.json();
    expect(data.code).toMatch(/^[0-9a-f]{8}$/);
    expect(data.code).not.toBe("old-code");
  });

  it("disable clears the code", async () => {
    const res = await post({ action: "disable" });
    const data = await res.json();
    expect(data.code).toBeNull();
    expect(bag.updated[0].data.statusShareCode).toBeNull();
  });

  it("rejects unknown actions", async () => {
    expect((await post({ action: "explode" })).status).toBe(400);
  });
});
