import { describe, it, expect, vi, beforeEach } from "vitest";

// applyServerReport is where agent truth meets dashboard rules: only AGENT
// servers assigned to the reporting node are touched, transitions mirror the
// Docker runner, and unintended exits route through the shared crash policy.

const bag = {
  server: null as any,
  updates: [] as any[],
  createdCommands: [] as any[],
  activityLogs: [] as any[],
  notifications: [] as any[],
  crashAutomations: vi.fn(),
  planDockerStart: vi.fn(),
  enqueueCommand: vi.fn(),
  appendedLogs: [] as string[],
};

vi.mock("@/lib/db", () => ({
  prisma: {
    server: {
      findUnique: async () => bag.server,
      update: async (args: any) => {
        bag.updates.push(args.data);
        return { ...bag.server, ...args.data };
      },
    },
    activityLog: {
      create: async (args: any) => {
        bag.activityLogs.push(args.data);
        return { id: "log1" };
      },
    },
  },
}));

vi.mock("@/lib/serverLogs", () => ({
  appendLog: (serverId: string, line: string) => bag.appendedLogs.push(line),
}));

vi.mock("@/lib/processMonitor", () => ({
  startMonitoring: vi.fn(),
  stopMonitoring: vi.fn(),
  clearStatsHistory: vi.fn(),
}));

vi.mock("@/lib/downloadProgress", () => ({
  clearProgress: vi.fn(),
}));

vi.mock("@/lib/firstOnline", () => ({
  markFirstOnline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications", () => ({
  sendNotification: async (...a: any[]) => bag.notifications.push(a),
}));

vi.mock("@/lib/actionScheduler", () => ({
  fireServerCrashAutomations: (...a: any[]) => bag.crashAutomations(...a),
}));

vi.mock("@/lib/runners/docker/planLaunch", () => ({
  planDockerStart: (...a: any[]) => bag.planDockerStart(...a),
}));

vi.mock("../commands", () => ({
  enqueueCommand: (...a: any[]) => bag.enqueueCommand(...a),
}));

import { applyServerReport } from "../syncState";

// The runner fires notifications and crash automations via un-awaited dynamic
// imports; drain the microtask queue before asserting on their side effects.
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function agentServer(overrides: Record<string, any> = {}) {
  return {
    id: "srv", userId: "u1", name: "Rust Server", game: "RUST",
    runnerType: "AGENT", nodeId: "node-1", port: 28015,
    status: "STARTING", definitionId: "def1", password: "pw",
    ramAllocation: 4, paramValues: null, ...overrides,
  };
}

const node = { id: "node-1", lanIp: "192.168.1.50" };

describe("applyServerReport", () => {
  beforeEach(() => {
    bag.updates = [];
    bag.createdCommands = [];
    bag.activityLogs = [];
    bag.notifications = [];
    bag.appendedLogs = [];
    bag.crashAutomations.mockClear();
    bag.planDockerStart.mockResolvedValue({ payload: { kind: "START", containerName: "c" } });
    bag.enqueueCommand.mockResolvedValue({ id: "cmd1" });
    bag.server = agentServer();
  });

  it("skips servers that are not AGENT-runner or belong to another node", async () => {
    bag.server = agentServer({ runnerType: "LOCAL" });
    expect((await applyServerReport({ serverId: "srv", status: "RUNNING" }, node)).skipReason).toBe("not_agent_server");
    bag.server = agentServer({ nodeId: "other-node" });
    expect((await applyServerReport({ serverId: "srv", status: "RUNNING" }, node)).skipReason).toBe("wrong_node");
    bag.server = null;
    expect((await applyServerReport({ serverId: "srv", status: "RUNNING" }, node)).skipReason).toBe("missing_server");
  });

  it("a started report marks STARTING without clobbering RUNNING or UPDATING", async () => {
    await applyServerReport({ serverId: "srv", status: "STARTING", started: true }, node);
    expect(bag.updates.some((u) => u.status === "STARTING")).toBe(true);

    bag.updates = [];
    bag.server = agentServer({ status: "RUNNING" });
    await applyServerReport({ serverId: "srv", status: "STARTING", started: true }, node);
    expect(bag.updates).toHaveLength(0);

    bag.updates = [];
    bag.server = agentServer({ status: "UPDATING" });
    await applyServerReport({ serverId: "srv", status: "STARTING", started: true }, node);
    expect(bag.updates).toHaveLength(0);
  });

  it("a RUNNING report sets RUNNING with the node's LAN IP and stamps first online", async () => {
    bag.server = agentServer({ status: "STARTING" });
    const out = await applyServerReport({ serverId: "srv", status: "RUNNING" }, node);
    expect(out.applied).toBe(true);
    expect(bag.updates.some((u) => u.status === "RUNNING" && u.ipAddress === "192.168.1.50")).toBe(true);
  });

  it("a RUNNING report never clobbers UPDATING (agent heartbeats keep coming during updates)", async () => {
    bag.server = agentServer({ status: "UPDATING" });
    await applyServerReport({ serverId: "srv", status: "RUNNING" }, node);
    expect(bag.updates.some((u) => u.status === "RUNNING")).toBe(false);
  });

  it("stores reported stats and appends log lines", async () => {
    await applyServerReport(
      { serverId: "srv", status: "RUNNING", cpuPercent: 12.5, memoryMB: 2048, logLines: ["line one", "line two"] },
      node,
    );
    expect(bag.updates.some((u) => u.cpuUsage === 12.5 && u.memoryUsage === 2048)).toBe(true);
    expect(bag.appendedLogs).toEqual(["line one", "line two"]);
  });

  it("an intentional stop is plain STOPPED with no crash machinery", async () => {
    const out = await applyServerReport(
      { serverId: "srv", status: "STOPPED", exitCode: 143, wasIntentional: true }, node,
    );
    expect(out.crash).toBeUndefined();
    expect(bag.activityLogs).toHaveLength(0);
    expect(bag.updates.some((u) => u.status === "STOPPED")).toBe(true);
  });

  it("a stop report without an exit code (container gone) is plain STOPPED", async () => {
    const out = await applyServerReport({ serverId: "srv", status: "STOPPED" }, node);
    expect(out.crash).toBeUndefined();
    expect(bag.activityLogs).toHaveLength(0);
  });

  it("an unintended nonzero exit routes through crash policy: plans a restart and alerts", async () => {
    const out = await applyServerReport(
      { serverId: "srv", status: "STOPPED", exitCode: 1, wasIntentional: false }, node,
    );
    expect(out.crash).toMatchObject({ exitCode: 1, restart: true });
    expect(bag.planDockerStart).toHaveBeenCalledWith(expect.objectContaining({ id: "srv" }));
    expect(bag.enqueueCommand).toHaveBeenCalledWith("node-1", "srv", "START", { kind: "START", containerName: "c" });
    expect(bag.activityLogs[0].action).toBe("SERVER_CRASH");
    await flush();
    expect(bag.notifications.length).toBeGreaterThan(0);
  });

  it("exhausted retries mark CRASHED, fire crash automations, and do not re-enqueue", async () => {
    // Drive the rolling counter past the max within one window.
    for (let i = 0; i < 6; i++) {
      bag.enqueueCommand.mockClear();
      await applyServerReport(
        { serverId: "srv", status: "STOPPED", exitCode: 1, wasIntentional: false }, node,
      );
    }
    await flush();
    expect(bag.enqueueCommand).not.toHaveBeenCalled();
    expect(bag.updates.some((u) => u.status === "CRASHED")).toBe(true);
    expect(bag.crashAutomations).toHaveBeenCalledWith("srv");
  });
});
