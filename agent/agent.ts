/**
 * RealmSwap agent — a dumb, dependency-free executor for a remote node
 * (NAS / mini PC / any machine with Docker).
 *
 * One channel, agent-initiated: it long-polls the dashboard's
 * /api/agents/sync carrying capabilities, per-container reports, and command
 * results; the response carries fully-resolved commands. It never listens on
 * the network, holds no database, and knows nothing about games — the
 * dashboard ships the complete launch plan (image, argv, env, ports, config
 * file contents).
 *
 *   npx tsx agent/agent.ts register --server http://192.168.1.10:3000 --token <token>
 *   npx tsx agent/agent.ts run
 *
 * Responses are HMAC-verified before acting on them (a forged response would
 * be remote code execution here).
 */
import { execFile as execFileCb, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { writeConfigFiles, buildDockerRunArgs, parseStatsLine, timingSafeEqualHex } from "./lib";
import type {
  SyncRequest, SyncResponse, SyncCommand, RegisterResponse,
  StartCommandPayload, StopCommandPayload, UpdateCommandPayload, SendCommandPayload,
  ServerReport,
} from "../src/lib/agents/protocol";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// State

interface AgentState {
  serverUrl: string;
  nodeId: string;
  nodeSecret: string;
}

const stateDir = process.env.REALMSWAP_AGENT_HOME || path.join(os.homedir(), ".realmswap-agent");
const statePath = path.join(stateDir, "agent.json");

function loadState(): AgentState {
  if (!fs.existsSync(statePath)) {
    console.error("No enrollment found. Run: agent register --server <dashboard-url> --token <token>");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(statePath, "utf-8"));
}

function saveState(state: AgentState): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function agentDataRoot(): string {
  return path.join(stateDir, "local-servers");
}

// ---------------------------------------------------------------------------
// Docker helpers (mirrors src/lib/runners/docker/dockerCli.ts semantics)

async function docker(args: string[], timeoutMs = 0): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFile("docker", args, {
      timeout: timeoutMs || undefined, windowsHide: true, maxBuffer: 10 * 1024 * 1024,
    });
    return { code: 0, stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" };
  } catch (err: any) {
    const code = typeof err?.code === "number" ? err.code : 1;
    return { code, stdout: err?.stdout?.toString() ?? "", stderr: err?.stderr?.toString() ?? err?.message ?? "" };
  }
}

async function dockerVersion(): Promise<string | null> {
  const res = await docker(["version", "--format", "{{.Server.Version}}"], 5000);
  return res.code === 0 ? res.stdout.trim() : null;
}

// ---------------------------------------------------------------------------
// Tracked servers: follower processes, readiness timers, intent flags

interface TrackedServer {
  serverId: string;
  containerName: string;
  follower: ReturnType<typeof spawn> | null;
  waiter: ReturnType<typeof spawn> | null;
  pendingLogLines: string[];
  logBuffer: string;
  readyTimer: NodeJS.Timeout | null;
  intentionalStop: boolean;
  reportedRunning: boolean;
}
const tracked = new Map<string, TrackedServer>();

function track(serverId: string, containerName: string): TrackedServer {
  let t = tracked.get(serverId);
  if (!t) {
    t = {
      serverId, containerName, follower: null, waiter: null,
      pendingLogLines: [], logBuffer: "", readyTimer: null,
      intentionalStop: false, reportedRunning: false,
    };
    tracked.set(serverId, t);
  }
  return t;
}

function appendTrackedLog(t: TrackedServer, chunk: string): void {
  t.logBuffer += chunk;
  const lines = t.logBuffer.split("\n");
  t.logBuffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim() === "") continue;
    t.pendingLogLines.push(line);
    if (t.pendingLogLines.length > 400) t.pendingLogLines.shift();
  }
  // Persist for node-side debugging (full history lives on the dashboard).
  try {
    const logPath = path.join(agentDataRoot(), t.serverId, "server.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, chunk.endsWith("\n") ? chunk : chunk + "\n");
  } catch { /* best-effort */ }
}

function attachFollower(t: TrackedServer): void {
  if (t.follower) return;
  const follower = spawn("docker", ["logs", "-f", "--tail", "0", t.containerName], { windowsHide: true });
  follower.stdout?.on("data", (b: Buffer) => appendTrackedLog(t, b.toString()));
  follower.stderr?.on("data", (b: Buffer) => appendTrackedLog(t, b.toString()));
  follower.on("close", () => { t.follower = null; });
  t.follower = follower;
}

function clearReadyTimer(t: TrackedServer): void {
  if (t.readyTimer) { clearTimeout(t.readyTimer); t.readyTimer = null; }
}

// ---------------------------------------------------------------------------
// Command execution

async function execStart(serverId: string, p: StartCommandPayload): Promise<{ ok: boolean; error?: string }> {
  const dataDir = path.join(agentDataRoot(), p.dataDirName);
  const configs = writeConfigFiles(dataDir, p.configFiles);
  if (!configs.ok) return { ok: false, error: configs.error };

  const t = track(serverId, p.containerName);
  t.intentionalStop = false;
  t.reportedRunning = false;
  await docker(["rm", "-f", p.containerName]);

  const res = await docker(buildDockerRunArgs(p, dataDir));
  if (res.code !== 0) {
    return { ok: false, error: res.stderr || res.stdout || "docker run failed" };
  }

  attachFollower(t);
  const waiter = spawn("docker", ["wait", p.containerName], { windowsHide: true });
  let out = "";
  waiter.stdout?.on("data", (b: Buffer) => (out += b.toString()));
  waiter.on("close", () => {
    clearReadyTimer(t);
    const exitCode = parseInt(out.trim(), 10);
    queueReport({
      serverId, status: "STOPPED", exitCode: isNaN(exitCode) ? null : exitCode,
      wasIntentional: t.intentionalStop,
    });
    t.waiter = null;
    t.reportedRunning = false;
  });
  t.waiter = waiter;

  queueReport({ serverId, status: "STARTING", started: true });
  if (typeof p.readyFallbackMs === "number" && p.readyFallbackMs > 0) {
    // Parity with DockerRunner: container games declare no readyPattern, so
    // the fallback timer is the readiness signal.
    clearReadyTimer(t);
    t.readyTimer = setTimeout(() => {
      t.readyTimer = null;
      t.reportedRunning = true;
      queueReport({ serverId, status: "RUNNING" });
    }, p.readyFallbackMs);
  }
  return { ok: true };
}

async function execStop(serverId: string, p: StopCommandPayload): Promise<{ ok: boolean; error?: string }> {
  const t = track(serverId, p.containerName);
  t.intentionalStop = true;
  clearReadyTimer(t);
  if (p.stdinStopCommand) {
    await docker([
      "exec", p.containerName, "bash", "-c",
      'printf "%s\\n" "$1" > /proc/1/fd/0', "_", p.stdinStopCommand,
    ]).catch(() => ({ code: 1, stdout: "", stderr: "" }));
  }
  const res = await docker(["stop", "-t", "30", p.containerName]);
  if (res.code !== 0 && !/no such container/i.test(res.stderr)) {
    return { ok: false, error: res.stderr || res.stdout || "docker stop failed" };
  }
  // The exit report comes from the wait watcher; if the container was already
  // gone, close the loop immediately.
  if (!t.waiter) {
    queueReport({ serverId, status: "STOPPED", exitCode: null, wasIntentional: true });
  }
  return { ok: true };
}

async function execUpdate(serverId: string, p: UpdateCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const dataDir = path.join(agentDataRoot(), p.dataDirName);
  fs.mkdirSync(dataDir, { recursive: true });
  const res = await docker(
    ["run", "--rm", "-v", `${dataDir}:/data`, p.containerImage, "bash", "-lc", p.steamcmdCmd],
    15 * 60 * 1000,
  );
  if (res.code !== 0) {
    return { ok: false, error: res.stderr || res.stdout || "SteamCMD update failed" };
  }
  return { ok: true, output: res.stdout.slice(-4000) };
}

async function execSendCommand(serverId: string, p: SendCommandPayload): Promise<{ ok: boolean; error?: string }> {
  const res = await docker([
    "exec", p.containerName, "bash", "-c",
    'printf "%s\\n" "$1" > /proc/1/fd/0', "_", p.command,
  ]);
  if (res.code !== 0) return { ok: false, error: res.stderr || res.stdout || "docker exec failed" };
  return { ok: true };
}

async function executeCommand(cmd: SyncCommand): Promise<{ commandId: string; ok: boolean; error?: string; output?: string }> {
  try {
    let result: { ok: boolean; error?: string; output?: string };
    switch (cmd.payload.kind) {
      case "START": result = await execStart(cmd.serverId, cmd.payload); break;
      case "STOP": result = await execStop(cmd.serverId, cmd.payload); break;
      case "UPDATE": result = await execUpdate(cmd.serverId, cmd.payload); break;
      case "SEND_COMMAND": result = await execSendCommand(cmd.serverId, cmd.payload); break;
      default: result = { ok: false, error: `Unknown command kind` };
    }
    return { commandId: cmd.id, ...result };
  } catch (err: any) {
    return { commandId: cmd.id, ok: false, error: err?.message ?? String(err) };
  }
}

// ---------------------------------------------------------------------------
// Reporting + sync loop

const reportQueue: ServerReport[] = [];
function queueReport(report: ServerReport): void {
  reportQueue.push(report);
}

function lanIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return null;
}

function freeDiskGB(): number | null {
  try {
    const s = fs.statfsSync(stateDir);
    return Math.round((s.bsize * s.bavail) / 1024 / 1024 / 1024 * 10) / 10;
  } catch {
    return null;
  }
}

async function containerStats(containerName: string): Promise<{ cpuPercent: number; memoryMB: number } | null> {
  const res = await docker(
    ["stats", containerName, "--no-stream", "--format", "{{.CPUPerc}},{{.MemUsage}}"], 8000,
  );
  if (res.code !== 0 || !res.stdout.trim()) return null;
  return parseStatsLine(res.stdout);
}

/** Re-attach to containers that kept running while the agent was down. */
async function reconcileAssigned(assigned: { serverId: string }[]): Promise<void> {
  for (const { serverId } of assigned) {
    const containerName = `realmswap-server-${serverId}`;
    const inspect = await docker(["inspect", "-f", "{{.State.Running}}", containerName]);
    const running = inspect.code === 0 && inspect.stdout.trim() === "true";
    const t = track(serverId, containerName);
    if (running && !t.reportedRunning) {
      attachFollower(t);
      queueReport({ serverId, status: "RUNNING" });
      t.reportedRunning = true;
      // Resume exit watching for a container we didn't start.
      if (!t.waiter) {
        const waiter = spawn("docker", ["wait", containerName], { windowsHide: true });
        let out = "";
        waiter.stdout?.on("data", (b: Buffer) => (out += b.toString()));
        waiter.on("close", () => {
          clearReadyTimer(t);
          const exitCode = parseInt(out.trim(), 10);
          queueReport({ serverId, status: "STOPPED", exitCode: isNaN(exitCode) ? null : exitCode, wasIntentional: t.intentionalStop });
          t.waiter = null;
          t.reportedRunning = false;
        });
        t.waiter = waiter;
      }
    } else if (!running && t.follower) {
      try { t.follower.kill(); } catch { /* ignore */ }
      t.follower = null;
    }
  }
}

async function syncOnce(state: AgentState, agentVersion: string): Promise<void> {
  // Reconcile lazily: the response's assignedServers list is only useful when
  // we might have missed something; doing it every beat is cheap enough
  // (a docker inspect per assigned server).
  const servers: ServerReport[] = [];

  // Flush transition reports.
  while (reportQueue.length > 0) {
    const report = reportQueue.shift()!;
    const t = tracked.get(report.serverId);
    if (t && (report.status === "RUNNING" || report.status === "STARTING")) {
      const stats = await containerStats(t.containerName);
      if (stats) Object.assign(report, stats);
    }
    servers.push(report);
  }

  // Heartbeat reports for tracked, believed-running containers (stats + logs).
  for (const t of Array.from(tracked.values())) {
    if (!t.reportedRunning) continue;
    const report: ServerReport = { serverId: t.serverId, status: "RUNNING" };
    const stats = await containerStats(t.containerName);
    if (stats) Object.assign(report, stats);
    if (t.pendingLogLines.length > 0) {
      report.logLines = t.pendingLogLines.splice(0, 300);
    }
    servers.push(report);
  }

  const body: SyncRequest = {
    protocolVersion: 1,
    agentVersion,
    platform: os.platform(),
    arch: os.arch(),
    dockerVersion: await dockerVersion(),
    lanIp: lanIp(),
    totalRamMB: Math.round(os.totalmem() / 1024 / 1024),
    freeDiskGB: freeDiskGB(),
    servers,
    results: results.splice(0, results.length),
  };

  const raw = JSON.stringify(body);
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", state.nodeSecret)
    .update(`${state.nodeId}\n${timestamp}\n${raw}`)
    .digest("hex");

  let res: Response;
  try {
    res = await fetch(`${state.serverUrl.replace(/\/$/, "")}/api/agents/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-node-id": state.nodeId,
        "x-node-timestamp": timestamp,
        "x-node-signature": signature,
      },
      body: raw,
      signal: AbortSignal.timeout(35000),
    });
  } catch (err: any) {
    console.error(`[sync] unreachable: ${err?.message ?? err}`);
    return;
  }
  if (res.status === 401) {
    console.error("[sync] rejected by dashboard (revoked or bad credentials) — exiting.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`[sync] dashboard returned ${res.status}`);
    return;
  }

  const rawResponse = await res.text();
  const expectedSig = crypto.createHmac("sha256", state.nodeSecret).update(rawResponse).digest("hex");
  const gotSig = res.headers.get("x-node-resp-signature");
  if (!gotSig || !timingSafeEqualHex(expectedSig, gotSig)) {
    console.error("[sync] response signature invalid — ignoring (possible tampering).");
    return;
  }

  const data = JSON.parse(rawResponse) as SyncResponse;
  await reconcileAssigned(data.assignedServers ?? []);
  for (const cmd of data.commands ?? []) {
    results.push(await executeCommand(cmd));
  }
}

// Command results produced between syncs (executions are awaited inline, so
// this is usually empty, but the queue keeps the shape honest).
const results: { commandId: string; ok: boolean; error?: string; output?: string }[] = [];

async function runLoop(state: AgentState, agentVersion: string): Promise<void> {
  console.log(`Agent ${agentVersion} running for node ${state.nodeId} → ${state.serverUrl}`);
  const dockerVer = await dockerVersion();
  console.log(dockerVer ? `Docker ${dockerVer} detected.` : "WARNING: Docker daemon not reachable — commands will fail.");
  for (;;) {
    try {
      await syncOnce(state, agentVersion);
    } catch (err: any) {
      console.error(`[loop] sync error: ${err?.message ?? err}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ---------------------------------------------------------------------------
// CLI

async function main(): Promise<void> {
  const agentVersion = "1.0.0";
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === "register") {
    const args: Record<string, string> = {};
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--server") args.server = rest[++i];
      else if (rest[i] === "--token") args.token = rest[++i];
    }
    if (!args.server || !args.token) {
      console.error("Usage: agent register --server <dashboard-url> --token <enrollment-token>");
      process.exit(1);
    }
    const res = await fetch(`${args.server.replace(/\/$/, "")}/api/agents/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: args.token }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`Registration failed: ${data.error ?? res.status}`);
      process.exit(1);
    }
    const reg = data as RegisterResponse;
    if (reg.protocolVersion !== 1) {
      console.error(`Dashboard protocol ${reg.protocolVersion} differs from agent 1 — update one side.`);
      process.exit(1);
    }
    saveState({ serverUrl: args.server, nodeId: reg.nodeId, nodeSecret: reg.nodeSecret });
    console.log(`Registered as node '${reg.nodeName}' (${reg.nodeId}). Start with: agent run`);
    return;
  }

  if (cmd === "run" || cmd === undefined) {
    await runLoop(loadState(), agentVersion);
    return;
  }

  console.error("Usage: agent [register --server <url> --token <token>] | [run]");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
