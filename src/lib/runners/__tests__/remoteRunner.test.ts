import { describe, it, expect, vi, beforeEach } from "vitest";

// RemoteRunner contract: enqueue a fully-planned command, await the agent's
// result, and surface failures as thrown errors with honest messages. Stats
// are agent-reported row values; a stale/offline node must throw (DEGRADED
// path), never record fake zeros.

const bag = {
  server: null as any,
  node: null as any,
  updates: [] as any[],
  enqueueCommand: vi.fn(),
  awaitCommandResult: vi.fn(),
  planDockerStart: vi.fn(),
  planDockerUpdate: vi.fn(),
  startMonitoring: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  prisma: {
    server: {
      findUnique: async (args: any) => bag.server,
      update: async (args: any) => {
        bag.updates.push(args.data);
        return { ...bag.server, ...args.data };
      },
    },
    agentNode: {
      findUnique: async () => bag.node,
    },
  },
}));

vi.mock("@/lib/agents/commands", () => ({
  enqueueCommand: (...a: any[]) => bag.enqueueCommand(...a),
  awaitCommandResult: (...a: any[]) => bag.awaitCommandResult(...a),
}));

vi.mock("../docker/planLaunch", () => ({
  planDockerStart: (...a: any[]) => bag.planDockerStart(...a),
  planDockerUpdate: (...a: any[]) => bag.planDockerUpdate(...a),
  resolveDefinition: vi.fn().mockResolvedValue({ spec: { launch: {} } }),
}));

vi.mock("@/lib/serverLogs", () => ({
  appendLog: vi.fn(),
  getServerLogTail: async () => "log tail",
}));

vi.mock("@/lib/processMonitor", () => ({
  startMonitoring: (...a: any[]) => bag.startMonitoring(...a),
  stopMonitoring: vi.fn(),
  clearStatsHistory: vi.fn(),
}));

vi.mock("@/lib/downloadProgress", () => ({
  clearProgress: vi.fn(),
}));

import { RemoteRunner } from "../RemoteRunner";

const runner = new RemoteRunner();

function onlineNode(overrides: Record<string, any> = {}) {
  return {
    id: "node-1", name: "Test Node", status: "ACTIVE", secret: "s3cret",
    lastSeenAt: new Date(Date.now() - 5000), ...overrides,
  };
}

function agentServer(overrides: Record<string, any> = {}) {
  return {
    id: "srv", userId: "u1", name: "Rust Server", game: "RUST", definitionId: "def1",
    runnerType: "AGENT", nodeId: "node-1", port: 28015, status: "STOPPED",
    ramAllocation: 4, password: "pw", paramValues: null,
    cpuUsage: 12.5, memoryUsage: 2048, ...overrides,
  };
}

describe("RemoteRunner", () => {
  beforeEach(() => {
    bag.updates = [];
    bag.enqueueCommand.mockReset().mockResolvedValue({ id: "cmd1" });
    bag.awaitCommandResult.mockReset().mockResolvedValue({ ok: true, status: "DONE" });
    bag.planDockerStart.mockReset().mockResolvedValue({ payload: { kind: "START", dataDirName: "srv" } });
    bag.planDockerUpdate.mockReset().mockResolvedValue({ payload: { kind: "UPDATE", steamcmdCmd: "steamcmd ..." } });
    bag.startMonitoring.mockClear();
    bag.server = agentServer();
    bag.node = onlineNode();
  });

  it("start plans the payload, enqueues on the right node, and starts monitoring on success", async () => {
    await runner.start(bag.server);
    expect(bag.planDockerStart).toHaveBeenCalledWith(expect.objectContaining({ id: "srv" }));
    expect(bag.enqueueCommand).toHaveBeenCalledWith("node-1", "srv", "START", { kind: "START", dataDirName: "srv" });
    expect(bag.awaitCommandResult).toHaveBeenCalledWith("cmd1", 60000);
    expect(bag.startMonitoring).toHaveBeenCalledTimes(1);
    expect(bag.updates.some((u) => u.status === "STARTING")).toBe(true);
  });

  it("start failure marks the server STOPPED and throws the agent's error", async () => {
    bag.awaitCommandResult.mockResolvedValue({ ok: false, error: "docker run failed", status: "FAILED" });
    await expect(runner.start(bag.server)).rejects.toThrow(/Failed to start on remote node: docker run failed/);
    expect(bag.updates.some((u) => u.status === "STOPPED")).toBe(true);
    expect(bag.startMonitoring).not.toHaveBeenCalled();
  });

  it("planning failure marks STOPPED and throws before touching the queue", async () => {
    bag.planDockerStart.mockRejectedValue(new Error("no container definition"));
    await expect(runner.start(bag.server)).rejects.toThrow(/no container definition/);
    expect(bag.enqueueCommand).not.toHaveBeenCalled();
    expect(bag.updates.some((u) => u.status === "STOPPED")).toBe(true);
  });

  it("refuses to operate on an offline node", async () => {
    bag.node = onlineNode({ lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) });
    await expect(runner.stop(bag.server)).rejects.toThrow(/offline/);
    expect(bag.enqueueCommand).not.toHaveBeenCalled();
  });

  it("refuses to operate on an unenrolled or revoked node", async () => {
    bag.node = onlineNode({ status: "PENDING", secret: null });
    await expect(runner.stop(bag.server)).rejects.toThrow(/not completed enrollment/);
    bag.node = onlineNode({ status: "REVOKED" });
    await expect(runner.stop(bag.server)).rejects.toThrow(/not completed enrollment/);
  });

  it("stop forwards the spec's stdin stop command when present", async () => {
    const { resolveDefinition } = await import("../docker/planLaunch");
    (resolveDefinition as any).mockResolvedValue({ spec: { launch: { stdinStopCommand: "stop\n" } } });
    await runner.stop(bag.server);
    expect(bag.enqueueCommand).toHaveBeenCalledWith(
      "node-1", "srv", "STOP",
      { kind: "STOP", containerName: "realmswap-server-srv", stdinStopCommand: "stop" },
    );
    expect(bag.awaitCommandResult).toHaveBeenCalledWith("cmd1", 30000);
  });

  it("update sets UPDATING, awaits a long result, and lands STOPPED on success", async () => {
    await runner.update(bag.server);
    expect(bag.updates.some((u) => u.status === "UPDATING")).toBe(true);
    expect(bag.awaitCommandResult).toHaveBeenCalledWith("cmd1", 15 * 60 * 1000);
    expect(bag.updates.some((u) => u.status === "STOPPED")).toBe(true);
  });

  it("update failure surfaces the agent's error and lands STOPPED", async () => {
    bag.awaitCommandResult.mockResolvedValue({ ok: false, error: "SteamCMD died", status: "FAILED" });
    await expect(runner.update(bag.server)).rejects.toThrow(/SteamCMD died/);
    expect(bag.updates.some((u) => u.status === "STOPPED")).toBe(true);
  });

  it("sendCommand awaits a short result and throws on agent failure", async () => {
    await runner.sendCommand(bag.server, "say hi");
    expect(bag.enqueueCommand).toHaveBeenCalledWith(
      "node-1", "srv", "SEND_COMMAND",
      { kind: "SEND_COMMAND", containerName: "realmswap-server-srv", command: "say hi" },
    );
    expect(bag.awaitCommandResult).toHaveBeenCalledWith("cmd1", 10000);

    bag.awaitCommandResult.mockResolvedValue({ ok: false, status: "TIMEOUT" });
    await expect(runner.sendCommand(bag.server, "say hi")).rejects.toThrow(/Failed to send command via agent: TIMEOUT/);
  });

  it("getStats returns the agent-reported row values while the node is online", async () => {
    await expect(runner.getStats(bag.server)).resolves.toEqual({ cpuPercent: 12.5, memoryMB: 2048 });
  });

  it("getStats throws when the node is stale so the monitor degrades instead of recording zeros", async () => {
    bag.node = onlineNode({ lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) });
    await expect(runner.getStats(bag.server)).rejects.toThrow(/offline/);
  });

  it("getStats throws for a server with no node assigned", async () => {
    bag.server = agentServer({ nodeId: null });
    await expect(runner.getStats(bag.server)).rejects.toThrow(/no node assigned/);
  });

  it("getLogs reads the dashboard-side log the sync stream appends to", async () => {
    await expect(runner.getLogs(bag.server)).resolves.toBe("log tail");
  });
});
