import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// /api/bot/action tunnel parity: the Discord start/restart/stop actions must
// manage the tunnel exactly like the dashboard routes do — a Discord-started
// server on a tunnel-only setup has to come up reachable, and a Discord stop
// has to tear the tunnel down. A tunnel failure never fails the action.

const bag = {
  server: null as any,
  serverUpdates: [] as any[],
  activityLogs: [] as any[],
  startTunnel: null as any,
  stopTunnel: null as any,
  runnerStart: null as any,
  runnerStop: null as any,
};

vi.mock("@/lib/db", () => ({
  prisma: {
    server: {
      findUnique: async () => bag.server,
      update: async ({ where, data }: any) => {
        bag.serverUpdates.push({ id: where.id, data });
        Object.assign(bag.server, data);
        return bag.server;
      },
    },
    activityLog: {
      create: async ({ data }: any) => {
        bag.activityLogs.push(data);
        return data;
      },
    },
  },
}));

vi.mock("@/lib/runners/factory", () => ({
  getRunner: () => ({ start: bag.runnerStart, stop: bag.runnerStop }),
}));

vi.mock("@/lib/eventBus", () => ({
  serverEventBus: { emit: vi.fn() },
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: () => true,
}));

vi.mock("@/lib/secureCompare", () => ({
  secureSecretEquals: (a: string, b: string) => a === b,
}));

vi.mock("@/lib/tunnels", () => ({
  startTunnel: (...args: any[]) => bag.startTunnel(...args),
  stopTunnel: (...args: any[]) => bag.stopTunnel(...args),
}));

import { POST } from "../route";

function makeServer(overrides: Record<string, any> = {}) {
  return {
    id: "srv-1",
    name: "ATM10",
    game: "MINECRAFT",
    status: "STOPPED",
    runnerType: "LOCAL",
    port: 25565,
    tunnelEnabled: true,
    userId: "owner-1",
    ...overrides,
  };
}

function post(action: string) {
  return POST(
    new NextRequest("http://localhost/api/bot/action", {
      method: "POST",
      body: JSON.stringify({ action, serverId: "srv-1" }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-bot-secret",
      },
    })
  );
}

beforeEach(() => {
  process.env.BOT_API_SECRET = "test-bot-secret";
  bag.server = makeServer();
  bag.serverUpdates = [];
  bag.activityLogs = [];
  bag.startTunnel = vi.fn().mockResolvedValue({ ok: true });
  bag.stopTunnel = vi.fn().mockResolvedValue(undefined);
  bag.runnerStart = vi.fn().mockResolvedValue(undefined);
  bag.runnerStop = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.BOT_API_SECRET;
});

describe("bot action auth guards", () => {
  it("503s when no bot secret is configured (fails closed)", async () => {
    delete process.env.BOT_API_SECRET;
    const res = await post("start");
    expect(res.status).toBe(503);
  });

  it("401s a wrong bearer", async () => {
    process.env.BOT_API_SECRET = "other-secret";
    const res = await post("start");
    expect(res.status).toBe(401);
  });
});

describe("bot start tunnel parity", () => {
  it("starts the tunnel after a successful start on a tunnel-enabled server", async () => {
    const res = await post("start");
    expect(res.status).toBe(200);
    expect(bag.runnerStart).toHaveBeenCalledTimes(1);
    expect(bag.startTunnel).toHaveBeenCalledWith("srv-1", 25565);
    expect(bag.stopTunnel).not.toHaveBeenCalled();
  });

  it("never starts a tunnel when tunnelEnabled is off", async () => {
    bag.server = makeServer({ tunnelEnabled: false });
    const res = await post("start");
    expect(res.status).toBe(200);
    expect(bag.startTunnel).not.toHaveBeenCalled();
  });

  it("still succeeds when the tunnel start reports failure", async () => {
    bag.startTunnel = vi.fn().mockResolvedValue({ ok: false, error: "claim timeout" });
    const res = await post("start");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("still succeeds when the tunnel start throws", async () => {
    bag.startTunnel = vi.fn().mockRejectedValue(new Error("playitd spawn failed"));
    const res = await post("start");
    expect(res.status).toBe(200);
    expect(bag.activityLogs[0].action).toBe("BOT_START");
  });
});

describe("bot stop tunnel parity", () => {
  it("stops the tunnel after stopping the server (mirrors the dashboard stop route)", async () => {
    bag.server = makeServer({ status: "RUNNING", tunnelEnabled: false });
    const res = await post("stop");
    expect(res.status).toBe(200);
    expect(bag.runnerStop).toHaveBeenCalledTimes(1);
    expect(bag.stopTunnel).toHaveBeenCalledWith("srv-1");
    expect(bag.startTunnel).not.toHaveBeenCalled();
  });

  it("still succeeds when the tunnel stop throws", async () => {
    bag.stopTunnel = vi.fn().mockRejectedValue(new Error("already gone"));
    const res = await post("stop");
    expect(res.status).toBe(200);
    expect(bag.activityLogs[0].action).toBe("BOT_STOP");
  });
});

describe("bot restart tunnel parity", () => {
  it("brings the tunnel back up after the restart, without a pre-stop teardown", async () => {
    bag.server = makeServer({ status: "RUNNING" });
    const res = await post("restart");
    expect(res.status).toBe(200);
    expect(bag.runnerStop).toHaveBeenCalledTimes(1);
    expect(bag.runnerStart).toHaveBeenCalledTimes(1);
    expect(bag.startTunnel).toHaveBeenCalledWith("srv-1", 25565);
    // Dashboard restart reuses the existing tunnel via startTunnel; it never
    // tears it down first.
    expect(bag.stopTunnel).not.toHaveBeenCalled();
  });

  it("skips the tunnel on restart when tunnelEnabled is off", async () => {
    bag.server = makeServer({ status: "RUNNING", tunnelEnabled: false });
    const res = await post("restart");
    expect(res.status).toBe(200);
    expect(bag.startTunnel).not.toHaveBeenCalled();
  });
});
