import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level guards for the settings API's per-server RCON fields: the GET
 * view must never echo the RCON password (only "configured"), and PUT must
 * persist the columns without being forced to resend game params. Boundary
 * modules (auth, server access, prisma, tunnels) are mocked; the zod
 * validation and masking under test are real. No network, no DB.
 */

const bag = vi.hoisted(() => ({
  user: { id: "user1" } as any,
  access: null as any,
  definitionSpec: null as string | null,
  updates: [] as any[],
  logs: [] as any[],
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => bag.user }));
vi.mock("@/lib/serverAuth", () => ({
  verifyServerAccess: async () => bag.access,
}));
vi.mock("@/lib/tunnels", () => ({
  startTunnel: vi.fn(),
  stopTunnel: vi.fn(),
}));
vi.mock("@/lib/runners/docker/planLaunch", () => ({
  buildAgentConfigEntries: () => [],
  configInstallSubDir: () => undefined,
}));
vi.mock("@/lib/agents/agentFiles", () => ({
  agentApplyConfigFiles: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameDefinition: {
      findUnique: async () => null,
      findFirst: async () => (bag.definitionSpec ? { id: "def1", spec: bag.definitionSpec } : null),
    },
    server: {
      update: async (args: any) => {
        bag.updates.push(args);
        return { id: "s1", ...args.data };
      },
    },
    activityLog: {
      create: async (args: any) => {
        bag.logs.push(args);
        return {};
      },
    },
  },
}));

import { GET, PUT } from "@/app/api/servers/[id]/settings/route";

const SPEC = JSON.stringify({
  install: { url: "https://example.invalid/server.jar", fileName: "server.jar", checkFile: "server.jar" },
  launch: { executable: "java", args: ["-jar", "server.jar"] },
  defaultPort: 25565,
  params: [{ key: "maxPlayers", label: "Max players", type: "number", default: 10 }],
  configFiles: [], // keeps PUT away from the filesystem in tests
  ports: [],
});

const serverRow = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  userId: "user1",
  name: "Test Server",
  game: "MINECRAFT",
  status: "STOPPED",
  definitionId: null,
  port: 25565,
  ramAllocation: 4,
  password: null,
  paramValues: null,
  pendingRestart: false,
  runnerType: null,
  rconPort: null,
  rconPassword: null,
  ...over,
});

function jsonReq(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/servers/s1/settings", {
    method: body === undefined ? "GET" : "PUT",
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
}

beforeEach(() => {
  bag.user = { id: "user1" };
  bag.updates = [];
  bag.logs = [];
  bag.definitionSpec = SPEC;
  bag.access = { server: serverRow(), isOwner: true, isCollaborator: false, role: "ADMIN" };
});

describe("GET /api/servers/[id]/settings — RCON view", () => {
  it("reports port + passwordConfigured and never echoes the password", async () => {
    bag.access.server = serverRow({ rconPort: 25575, rconPassword: "sup3rsekret" });

    const res = await GET(jsonReq(), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.rcon).toEqual({ port: 25575, passwordConfigured: true });
    expect(JSON.stringify(data)).not.toContain("sup3rsekret");
  });

  it("reports null port / not configured when RCON was never set up", async () => {
    const res = await GET(jsonReq(), { params: Promise.resolve({ id: "s1" }) });
    const data = await res.json();
    expect(data.rcon).toEqual({ port: null, passwordConfigured: false });
  });
});

describe("PUT /api/servers/[id]/settings — RCON persistence", () => {
  it("saves an RCON-only update without touching game params", async () => {
    const res = await PUT(jsonReq({ rconPort: 25575, rconPassword: "newpass" }), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(bag.updates).toHaveLength(1);
    expect(bag.updates[0].data).toEqual({ rconPort: 25575, rconPassword: "newpass", pendingRestart: false });
    expect(bag.updates[0].data.paramValues).toBeUndefined();
    expect(data.rcon).toEqual({ port: 25575, passwordConfigured: true });
    expect(JSON.stringify(data)).not.toContain("newpass");
    expect(bag.logs[0].data.action).toBe("UPDATE_SETTINGS");
  });

  it("clears the port when null is sent and keeps the password when omitted", async () => {
    bag.access.server = serverRow({ rconPort: 25575, rconPassword: "existing" });
    const res = await PUT(jsonReq({ rconPort: null }), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);

    expect(bag.updates[0].data).toEqual({ rconPort: null, pendingRestart: false });
    expect(bag.updates[0].data.rconPassword).toBeUndefined();
  });

  it("still accepts a full game-settings save alongside RCON fields", async () => {
    const res = await PUT(jsonReq({ paramValues: { maxPlayers: 5 }, rconPort: 25575 }), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(200);
    expect(bag.updates[0].data.paramValues).toBe(JSON.stringify({ maxPlayers: 5 }));
    expect(bag.updates[0].data.rconPort).toBe(25575);
  });

  it("rejects an out-of-range port and updates nothing", async () => {
    const res = await PUT(jsonReq({ rconPort: 70000 }), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(400);
    expect(bag.updates).toHaveLength(0);
  });

  it("rejects an empty payload", async () => {
    const res = await PUT(jsonReq({}), { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(400);
    expect(bag.updates).toHaveLength(0);
  });
});
