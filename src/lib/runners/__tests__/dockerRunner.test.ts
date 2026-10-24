import { describe, it, expect, vi, beforeEach } from "vitest";

// DockerRunner class guards — the honest-behavior contract for the runner the
// 2026-10-23 audit traced end to end (no fakes found; these tests keep it
// that way). Boundary modules are mocked; crashPolicy and dockerCli's pure
// helpers stay real so their semantics are exercised for real.

const bag = {
  docker: vi.fn(),
  spawned: [] as any[],
  server: null as any,
  servers: [] as any[],
  statuses: [] as any[],
  logs: [] as string[],
  activityLogs: [] as any[],
  notifications: [] as any[],
  definitions: {} as Record<string, { spec: string; installMethod: string }>,
  planContainerResult: null as any,
  fireCrashAutomations: vi.fn(),
  setProgress: vi.fn(),
  clearProgress: vi.fn(),
  startMonitoring: vi.fn(),
  stopMonitoring: vi.fn(),
  clearStatsHistory: vi.fn(),
};

vi.mock("../docker/dockerCli", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../docker/dockerCli")>();
  return {
    ...actual,
    docker: (...args: string[]) => bag.docker(...args),
    dockerSpawn: (args: string[]) => {
      const proc: any = {
        args,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
      bag.spawned.push(proc);
      return proc;
    },
  };
});

vi.mock("../../db", () => ({
  prisma: {
    server: {
      findUnique: async () => bag.server,
      findMany: async () => bag.servers,
      update: async (args: any) => {
        bag.statuses.push(args.data);
        return { ...bag.server, ...args.data };
      },
    },
    gameDefinition: {
      findUnique: async (args: any) => bag.definitions[args.where.id] ?? null,
      findFirst: async () => Object.values(bag.definitions)[0] ?? null,
    },
    activityLog: {
      create: async (args: any) => {
        bag.activityLogs.push(args.data);
        return { id: "log1" };
      },
    },
  },
}));

vi.mock("../../serverLogs", () => ({
  appendLog: (serverId: string, line: string) => bag.logs.push(line),
  clearLogs: vi.fn(),
  getServerLogTail: async () => "",
}));

vi.mock("../../eventBus", () => ({
  serverEventBus: { emit: vi.fn() },
}));

vi.mock("../../downloadProgress", () => ({
  setProgress: (...a: any[]) => bag.setProgress(...a),
  clearProgress: () => bag.clearProgress(),
  parseSteamProgress: () => null,
}));

vi.mock("../../processMonitor", () => ({
  startMonitoring: (...a: any[]) => bag.startMonitoring(...a),
  stopMonitoring: () => bag.stopMonitoring(),
  clearStatsHistory: () => bag.clearStatsHistory(),
}));

vi.mock("../../notifications", () => ({
  sendNotification: async (...a: any[]) => {
    bag.notifications.push(a);
  },
}));

vi.mock("../../actionScheduler", () => ({
  fireServerCrashAutomations: (...a: any[]) => bag.fireCrashAutomations(...a),
}));

vi.mock("../../definitions/applyConfigFiles", () => ({
  applyConfigFiles: vi.fn(),
}));

vi.mock("../../definitions/context", () => ({
  buildContext: () => ({}),
}));

vi.mock("../../definitions/plan", () => ({
  planContainer: () => bag.planContainerResult,
  planPorts: () => [],
  planInstall: () => ({ appId: "258550" }),
}));

vi.mock("../../appPaths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../appPaths")>();
  return {
    ...actual,
    dataRoot: () => "/tmp/realswap-docker-runner-test",
    // Real env-driven behavior with the test dataRoot as the fallback.
    dockerMountRoot: () => process.env.GAMEVAULT_HOST_DATA_DIR?.trim() || "/tmp/realswap-docker-runner-test",
  };
});

import { DockerRunner } from "../DockerRunner";
import { CRASH_MAX_RETRIES } from "../../crashPolicy";

const runner = new DockerRunner();

// The runner fires notifications and crash automations via un-awaited dynamic
// imports; drain the microtask queue before asserting on their side effects.
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function seedDefinition(installMethod = "STEAMCMD") {
  bag.definitions["def1"] = { spec: JSON.stringify({ launch: {} }), installMethod };
  bag.planContainerResult = {
    image: "cm2network/steamcmd",
    installSubDir: "rust",
    executable: "RustDedicatedServer",
    args: [],
  };
}

function seedServer(overrides: Record<string, any> = {}) {
  bag.server = {
    id: "srv",
    userId: "u1",
    name: "Rust Server",
    game: "RUST",
    definitionId: "def1",
    ramAllocation: 4,
    runnerType: "DOCKER",
    ...overrides,
  };
  return bag.server;
}

describe("DockerRunner", () => {
  beforeEach(() => {
    (globalThis as any).dockerFollowers?.clear?.();
    (globalThis as any).dockerIntentionalStops?.clear?.();
    (globalThis as any).dockerCrashCounters?.clear?.();
    bag.docker = vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" });
    bag.spawned.length = 0;
    bag.server = null;
    bag.servers = [];
    bag.statuses = [];
    bag.logs = [];
    bag.activityLogs = [];
    bag.notifications = [];
    bag.definitions = {};
    bag.planContainerResult = null;
    bag.fireCrashAutomations = vi.fn().mockResolvedValue(undefined);
    bag.startMonitoring = vi.fn();
    bag.stopMonitoring = vi.fn();
    bag.clearStatsHistory = vi.fn();
  });

  describe("start", () => {
    it("refuses non-SteamCMD games before touching docker", async () => {
      seedDefinition("MANUAL");
      seedServer();

      await expect(runner.start(bag.server)).rejects.toThrow(/SteamCMD games only/i);
      expect(bag.docker).not.toHaveBeenCalled();
      expect(bag.statuses).toHaveLength(0);
    });

    it("refuses games without a container definition", async () => {
      seedDefinition();
      bag.planContainerResult = null;
      seedServer();

      await expect(runner.start(bag.server)).rejects.toThrow(/no container definition/i);
      expect(bag.docker).not.toHaveBeenCalled();
      expect(bag.statuses).toHaveLength(0);
    });

    it("surfaces docker run failure: logs it, marks STOPPED, throws", async () => {
      seedDefinition();
      seedServer();
      bag.docker
        .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" }) // rm -f stale container
        .mockResolvedValueOnce({ code: 1, stdout: "", stderr: "Cannot connect to the Docker daemon" });

      await expect(runner.start(bag.server)).rejects.toThrow(/Failed to start Docker container/);
      expect(bag.statuses.some((s: any) => s.status === "STOPPED")).toBe(true);
      expect(bag.clearProgress).toHaveBeenCalled();
      expect(bag.logs.some((l) => /Failed to start container/.test(l))).toBe(true);
      expect(bag.startMonitoring).not.toHaveBeenCalled();
    });

    it("on success: removes the stale container, runs, attaches follower + exit watcher, monitors", async () => {
      seedDefinition();
      seedServer();

      await runner.start(bag.server);

      expect(bag.docker.mock.calls[0][0][0]).toBe("rm");
      expect(bag.docker.mock.calls[1][0][0]).toBe("run");
      // argv built by the real buildRunArgs: no shell, world data bind-mounted
      // from the same local-servers/<id> dir the Local runner and backups use
      expect(bag.docker.mock.calls[1][0]).toContain(
        "/tmp/realswap-docker-runner-test/local-servers/srv:/data"
      );
      expect(bag.spawned).toHaveLength(2); // logs -f + wait
      expect(bag.spawned.map((p) => p.args[0])).toEqual(["logs", "wait"]);
      expect(bag.startMonitoring).toHaveBeenCalledTimes(1);
      expect(bag.statuses.some((s: any) => s.status === "STARTING")).toBe(true);
    });

    it("containerized dashboard: mount source comes from GAMEVAULT_HOST_DATA_DIR, writes still go to dataRoot", async () => {
      seedDefinition();
      seedServer();
      const prev = process.env.GAMEVAULT_HOST_DATA_DIR;
      process.env.GAMEVAULT_HOST_DATA_DIR = "/mnt/raid/realmswap";
      try {
        await runner.start(bag.server);

        // The daemon must see the HOST path, not the container-internal one.
        expect(bag.docker.mock.calls[1][0]).toContain(
          "/mnt/raid/realmswap/local-servers/srv:/data"
        );
        expect(bag.docker.mock.calls[1][0]).not.toContain(
          "/tmp/realswap-docker-runner-test/local-servers/srv:/data"
        );
      } finally {
        if (prev === undefined) delete process.env.GAMEVAULT_HOST_DATA_DIR;
        else process.env.GAMEVAULT_HOST_DATA_DIR = prev;
      }
    });
  });

  describe("stop", () => {
    it("tolerates an already-gone container and still marks the server STOPPED", async () => {
      seedDefinition();
      seedServer();
      bag.docker.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "Error: No such container: x" });

      await expect(runner.stop(bag.server)).resolves.toBeUndefined();
      expect(bag.statuses.some((s: any) => s.status === "STOPPED")).toBe(true);
    });

    it("throws on a real docker failure", async () => {
      seedDefinition();
      seedServer();
      bag.docker.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "Cannot connect to the Docker daemon" });

      await expect(runner.stop(bag.server)).rejects.toThrow(/Failed to stop Docker container/);
    });
  });

  describe("getStats", () => {
    it("rejects on docker failure instead of recording fake zero telemetry", async () => {
      seedServer();
      bag.docker.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "Cannot connect to the Docker daemon" });

      await expect(runner.getStats(bag.server)).rejects.toThrow(/Docker stats failed/);
    });

    it("parses real stats output through the shared parser", async () => {
      seedServer();
      bag.docker.mockResolvedValueOnce({ code: 0, stdout: "12.5%,512MiB/4GiB\n", stderr: "" });

      await expect(runner.getStats(bag.server)).resolves.toEqual({ cpuPercent: 12.5, memoryMB: 512 });
    });
  });

  describe("container exit routing", () => {
    it("clean exit marks the server STOPPED with no crash row", async () => {
      seedServer();

      await (runner as any).handleContainerExit("srv", 0, "RUST", 4);

      expect(bag.statuses.some((s: any) => s.status === "STOPPED")).toBe(true);
      expect(bag.activityLogs).toHaveLength(0);
      expect(bag.stopMonitoring).toHaveBeenCalled();
    });

    it("crash writes SERVER_CRASH history and schedules the auto-restart", async () => {
      vi.useFakeTimers();
      try {
        seedDefinition();
        seedServer();
        bag.docker.mockResolvedValue({ code: 0, stdout: "container-id", stderr: "" });

        await (runner as any).handleContainerExit("srv", 1, "RUST", 4);

        expect(bag.activityLogs).toHaveLength(1);
        expect(bag.activityLogs[0].action).toBe("SERVER_CRASH");
        const meta = JSON.parse(bag.activityLogs[0].metadata);
        expect(meta.exitCode).toBe(1);
        expect(meta.attempt).toBe(1);
        await flush();
        expect(bag.notifications.length).toBe(1);
        expect(bag.statuses.some((s: any) => s.status === "STARTING")).toBe(true);

        // 5s later the restart re-runs start() end to end
        await vi.advanceTimersByTimeAsync(5100);
        expect(bag.docker.mock.calls.some((c: any[]) => c[0][0] === "run")).toBe(true);
        expect(bag.startMonitoring).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("exhausted retries mark the server CRASHED and fire crash automations", async () => {
      seedDefinition();
      seedServer();
      expect(CRASH_MAX_RETRIES).toBe(3);

      for (let i = 0; i < 3; i++) {
        await (runner as any).handleContainerExit("srv", 1, "RUST", 4);
      }
      await flush();

      expect(bag.statuses.some((s: any) => s.status === "CRASHED")).toBe(true);
      expect(bag.fireCrashAutomations).toHaveBeenCalled();
    });

    it("an intentional stop is not a crash", async () => {
      seedServer();
      (globalThis as any).dockerIntentionalStops.add("srv");

      await (runner as any).handleContainerExit("srv", 137, "RUST", 4);

      expect(bag.statuses.some((s: any) => s.status === "STOPPED")).toBe(true);
      expect(bag.activityLogs).toHaveLength(0);
    });
  });

  describe("reconcileOnBoot", () => {
    it("reattaches follower, watcher, and monitoring to a still-running container", async () => {
      const server = seedServer();
      seedDefinition();
      bag.servers = [server];
      bag.docker.mockResolvedValue({ code: 0, stdout: "true\n", stderr: "" });

      await runner.reconcileOnBoot();

      expect(bag.docker.mock.calls[0][0]).toEqual(["inspect", "-f", "{{.State.Running}}", "realmswap-server-srv"]);
      expect(bag.spawned).toHaveLength(2);
      expect(bag.startMonitoring).toHaveBeenCalledTimes(1);
      expect(bag.statuses).toHaveLength(0);
      expect(bag.logs.some((l) => /Reattached/.test(l))).toBe(true);
    });

    it("marks containers that no longer exist as STOPPED", async () => {
      const server = seedServer();
      bag.servers = [server];
      bag.docker.mockResolvedValue({ code: 1, stdout: "", stderr: "No such object: realmswap-server-srv" });

      await runner.reconcileOnBoot();

      expect(bag.statuses.some((s: any) => s.status === "STOPPED")).toBe(true);
      expect(bag.spawned).toHaveLength(0);
      expect(bag.startMonitoring).not.toHaveBeenCalled();
    });

    it("never throws — a failing inspect is logged, not propagated", async () => {
      const server = seedServer();
      bag.servers = [server];
      bag.docker.mockRejectedValue(new Error("docker binary missing"));

      await expect(runner.reconcileOnBoot()).resolves.toBeUndefined();
      expect(bag.statuses).toHaveLength(0);
    });
  });
});
