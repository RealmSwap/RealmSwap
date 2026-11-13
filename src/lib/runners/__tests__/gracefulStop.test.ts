import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// Graceful-stop orchestration in LocalRunner — the contract:
//   1. a stdin stop command is written to the server console and awaited,
//   2. an RCON stop command is sent when the server row has RCON configured,
//   3. anything else force-kills immediately (unchanged legacy behavior),
//   4. after 7s of natural-exit waiting the tree is force-killed anyway.
// No test here starts a real game server — the child process, taskkill exec,
// RCON client, and prisma are all fakes.

const bag = {
  execCmds: [] as string[],
  logs: [] as string[],
  rconResults: [] as string[],
  child: null as any,
  serverRow: null as any,
  spec: null as any,
  rconResponse: "ok" as string | null,
};

vi.mock("../../db", () => ({
  prisma: {
    server: {
      findUnique: vi.fn(async () => bag.serverRow),
      update: vi.fn(async () => bag.serverRow),
    },
    gameDefinition: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => ({
        spec: JSON.stringify(bag.spec),
        installMethod: "DOWNLOAD",
      })),
    },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    throw new Error("spawn must not be called by stop tests");
  }),
  exec: vi.fn((cmd: string, cb?: (err: any) => void) => {
    bag.execCmds.push(cmd);
    if (cmd.includes("taskkill") && bag.child) {
      // Model the process tree actually dying from the force kill.
      setTimeout(() => {
        bag.child.exitCode = 1;
        bag.child.emit("exit", 1, "SIGKILL");
      }, 0);
    }
    cb?.(null);
    return {} as any;
  }),
  execFile: vi.fn(),
}));

vi.mock("../../rconManager", () => ({
  rconManager: {
    execute: vi.fn(async (_serverId: string, command: string) => {
      bag.rconResults.push(command);
      return bag.rconResponse;
    }),
  },
}));

vi.mock("../../serverLogs", () => ({
  appendLog: vi.fn((_serverId: string, msg: string) => bag.logs.push(msg)),
  clearLogs: vi.fn(),
  serverLogFile: vi.fn(() => "unused"),
  getServerLogTail: vi.fn(() => ""),
}));

vi.mock("../../eventBus", () => ({
  serverEventBus: { emit: vi.fn(), on: vi.fn() },
}));

vi.mock("../../processMonitor", () => ({
  startMonitoring: vi.fn(),
  stopMonitoring: vi.fn(),
  clearStatsHistory: vi.fn(),
}));

vi.mock("../../upnp", () => ({
  mapPort: vi.fn(),
  unmapPort: vi.fn(),
  getPublicIP: vi.fn(),
  getLanIP: vi.fn(),
}));

vi.mock("../../appPaths", () => ({
  dataRoot: vi.fn(() => "/tmp/realmswap-test"),
}));

import { LocalRunner, localProcesses } from "../LocalRunner";
import { rconManager } from "../../rconManager";

let nextPid = 4242;

function makeChild() {
  const child: any = new EventEmitter();
  child.pid = ++nextPid;
  child.exitCode = null;
  child.signalCode = null;
  child.stdin = { write: vi.fn() };
  child.kill = vi.fn(() => true);
  return child;
}

const baseSpec = {
  install: { url: "https://example.invalid/server.zip", fileName: "server.zip", checkFile: "server.exe" },
  launch: { executable: "server.exe", args: [] },
  defaultPort: 7777,
  params: [],
  configFiles: [],
  ports: [],
};

function specWith(launch: Record<string, unknown>) {
  return { ...baseSpec, launch: { ...baseSpec.launch, ...launch } };
}

function serverRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "srv-1",
    userId: "user-1",
    name: "Test Server",
    game: "TESTGAME",
    status: "RUNNING",
    pid: null,
    port: 7777,
    ramAllocation: 4,
    password: null,
    paramValues: null,
    enableUpnp: false,
    rconPort: null,
    rconPassword: null,
    definitionId: null,
    ...overrides,
  };
}

async function seedRunningServer(child: any, server: any) {
  bag.child = child;
  bag.serverRow = server;
  localProcesses.set(server.id, child);
}

beforeEach(() => {
  vi.clearAllMocks(); // mock factories run once per file — drop per-test call history
  bag.execCmds = [];
  bag.logs = [];
  bag.rconResults = [];
  bag.rconResponse = "ok";
  bag.spec = baseSpec;
  bag.child = null;
});

afterEach(() => {
  for (const id of Array.from(localProcesses.keys())) localProcesses.delete(id);
  vi.useRealTimers();
});

describe("stopLocalServer: graceful stop channels", () => {
  it("sends the stdin stop command and waits for the natural exit", async () => {
    bag.spec = specWith({ stdinStopCommand: "exit\n" });
    const server = serverRow();
    const child = makeChild();
    // A well-behaved server exits shortly after receiving the console command.
    child.stdin.write.mockImplementation(() => {
      setTimeout(() => {
        child.exitCode = 0;
        child.emit("exit", 0, null);
      }, 0);
    });
    await seedRunningServer(child, server);

    await new LocalRunner().stop(server as any);

    expect(child.stdin.write).toHaveBeenCalledWith("exit\n");
    expect(bag.execCmds).toEqual([]); // no taskkill on a clean exit
    expect(child.kill).not.toHaveBeenCalled();
    expect(rconManager.execute).not.toHaveBeenCalled();
  });

  it("falls back to SIGTERM when the stdin write throws", async () => {
    bag.spec = specWith({ stdinStopCommand: "exit\n" });
    const server = serverRow();
    const child = makeChild();
    child.stdin.write.mockImplementation(() => {
      throw new Error("EPIPE");
    });
    child.kill.mockImplementation(() => {
      child.exitCode = 0;
      child.emit("exit", 0, null);
      return true;
    });
    await seedRunningServer(child, server);

    await new LocalRunner().stop(server as any);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(bag.execCmds).toEqual([]);
  });

  it("escalates to SIGKILL + taskkill after the 7s window when the stdin stop never exits", async () => {
    bag.spec = specWith({ stdinStopCommand: "exit\n" });
    const server = serverRow();
    const child = makeChild(); // ignores the stop command; never exits
    await seedRunningServer(child, server);

    vi.useFakeTimers();
    const stopPromise = new LocalRunner().stop(server as any);
    await vi.advanceTimersByTimeAsync(7001);

    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(bag.execCmds.some((c) => c.includes(`taskkill /F /T /PID ${child.pid}`))).toBe(true);

    child.emit("exit", 1, "SIGKILL");
    await stopPromise;
  });

  it("sends the RCON stop command when RCON is configured on the server row", async () => {
    bag.spec = specWith({ rconStopCommand: "quit" });
    const server = serverRow({ rconPort: 28016, rconPassword: "secret" });
    const child = makeChild();
    await seedRunningServer(child, server);

    const stopPromise = new LocalRunner().stop(server as any);
    await vi.waitFor(() => expect(rconManager.execute).toHaveBeenCalledWith("srv-1", "quit"));

    // RCON accepted the command: no stdin write, no force-kill yet.
    expect(child.stdin.write).not.toHaveBeenCalled();
    expect(bag.execCmds).toEqual([]);
    expect(child.kill).not.toHaveBeenCalled();

    child.exitCode = 0;
    child.emit("exit", 0, null);
    await stopPromise;
  });

  it("force-kills immediately when the RCON stop command fails", async () => {
    bag.spec = specWith({ rconStopCommand: "Shutdown 5 Server_stopping" });
    const server = serverRow({ rconPort: 8211, rconPassword: "secret" });
    const child = makeChild();
    bag.rconResponse = null; // rconManager transport failure
    await seedRunningServer(child, server);

    await new LocalRunner().stop(server as any);

    expect(rconManager.execute).toHaveBeenCalledWith("srv-1", "Shutdown 5 Server_stopping");
    expect(bag.execCmds.some((c) => c.includes(`taskkill /F /T /PID ${child.pid}`))).toBe(true);
    expect(child.stdin.write).not.toHaveBeenCalled();
  });

  it("falls back to force-kill when the spec declares RCON but the server row has no RCON config", async () => {
    bag.spec = specWith({ rconStopCommand: "quit" });
    const server = serverRow(); // no rconPort / rconPassword
    const child = makeChild();
    await seedRunningServer(child, server);

    await new LocalRunner().stop(server as any);

    expect(rconManager.execute).not.toHaveBeenCalled();
    expect(child.stdin.write).not.toHaveBeenCalled();
    expect(bag.execCmds.some((c) => c.includes("taskkill /F /T /PID"))).toBe(true);
  });
});

describe("stopLocalServer: no-regression force-kill paths", () => {
  it("force-kills immediately when the game declares no stop command", async () => {
    const server = serverRow();
    const child = makeChild();
    await seedRunningServer(child, server);

    await new LocalRunner().stop(server as any);

    expect(child.stdin.write).not.toHaveBeenCalled();
    expect(rconManager.execute).not.toHaveBeenCalled();
    expect(bag.execCmds.some((c) => c.includes(`taskkill /F /T /PID ${child.pid}`))).toBe(true);
    expect(bag.logs.some((l) => l.includes("Termination request received"))).toBe(true);
  });

  it("still kills by the recorded pid for servers adopted after an app restart (no live child handle)", async () => {
    const server = serverRow({ pid: 999111 });
    bag.serverRow = server; // nothing in localProcesses — monitor-only session

    await new LocalRunner().stop(server as any);

    expect(bag.execCmds.some((c) => c.includes("taskkill /F /T /PID 999111"))).toBe(true);
  });
});
