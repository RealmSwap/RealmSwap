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
import { writeConfigFiles, buildDockerRunArgs, parseStatsLine, timingSafeEqualHex, buildTarArgs, installStagedTree, readServerFile, writeServerFile, listServerDir, applyConfigEntries, deletePathsInDataDir, scanTreeFor, modSnapshotTarName, tunnelBinPath, tunnelSecretPath, tunnelSocketPath, tunnelPidPath, downloadToFile, reconcileTunnelOrphans, walkDiskUsage } from "./lib";
import type {
  SyncRequest, SyncResponse, SyncCommand, RegisterResponse,
  StartCommandPayload, StopCommandPayload, UpdateCommandPayload, SendCommandPayload,
  BackupCreateCommandPayload, BackupRestoreCommandPayload,
  FileReadCommandPayload, FileWriteCommandPayload, FileListCommandPayload, ConfigApplyCommandPayload,
  FilesApplyCommandPayload, FilesRestoreCommandPayload, FileDeleteCommandPayload,
  DockerRunCommandPayload, DirScanCommandPayload, PathsSnapshotCommandPayload,
  TunnelStartCommandPayload, TunnelStopCommandPayload, DiskUsageCommandPayload,
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

// Playit tunnel daemons, keyed by serverId (their lifecycle is independent of
// the game containers but reported in the same heartbeat).
const tunnelProcs = new Map<string, ReturnType<typeof spawn>>();

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

async function execBackupCreate(serverId: string, p: BackupCreateCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const dataDir = path.join(agentDataRoot(), p.dataDirName);
  const rootAbs = path.resolve(dataDir);
  const srcAbs = path.resolve(path.join(dataDir, p.srcRelDir));
  // "." (world export) resolves to the root itself and is legal.
  if (srcAbs !== rootAbs && !srcAbs.startsWith(rootAbs + path.sep)) {
    return { ok: false, error: `Backup source escapes the server data dir: ${p.srcRelDir}` };
  }
  fs.mkdirSync(stateDir, { recursive: true });
  const tarPath = path.join(stateDir, `backup-${serverId}-${Date.now()}.tar`);
  try {
    let entries: string[];
    let baseDir: string;
    if (p.includeFiles && p.includeFiles.length > 0) {
      // Valheim: archive just the world files that exist.
      baseDir = srcAbs;
      entries = p.includeFiles.filter((f: string) => fs.existsSync(path.join(srcAbs, f)));
      if (entries.length === 0) {
        return { ok: false, error: "No world files found to back up — start the server once to generate a world." };
      }
    } else {
      if (!fs.existsSync(srcAbs)) {
        return { ok: false, error: "No save files found — start the server once to generate a world." };
      }
      baseDir = dataDir;
      entries = [p.srcRelDir];
    }
    await runTar(buildTarArgs(baseDir, entries, tarPath));

    // Upload: HMAC path-auth over method+path (multi-GB body is not hashed;
    // the dashboard verifies the archive structurally after extraction).
    const timestamp = Date.now().toString();
    const signature = crypto.createHmac("sha256", requireState().nodeSecret)
      .update(`${requireState().nodeId}\n${timestamp}\nPOST\n${p.uploadPath}`)
      .digest("hex");
    const res = await fetch(`${requireState().serverUrl.replace(/\/$/, "")}${p.uploadPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-tar",
        "x-node-id": requireState().nodeId,
        "x-node-timestamp": timestamp,
        "x-node-signature": signature,
      },
      body: fs.createReadStream(tarPath),
      duplex: "half",
      signal: AbortSignal.timeout(30 * 60 * 1000),
    } as any);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `Upload failed: ${data.error ?? res.status}` };
    }
    return { ok: true, output: JSON.stringify({ uploadId: data.uploadId }) };
  } finally {
    try { if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath); } catch { /* best-effort */ }
  }
}

async function execBackupRestore(serverId: string, p: BackupRestoreCommandPayload): Promise<{ ok: boolean; error?: string }> {
  const dataDir = path.join(agentDataRoot(), p.dataDirName);
  const destAbs = path.resolve(path.join(dataDir, p.destRelDir));
  if (!destAbs.startsWith(path.resolve(dataDir) + path.sep)) {
    return { ok: false, error: `Restore destination escapes the server data dir: ${p.destRelDir}` };
  }
  fs.mkdirSync(stateDir, { recursive: true });
  const tarPath = path.join(stateDir, `restore-${serverId}-${Date.now()}.tar`);
  const stagingDir = `${destAbs}.restore-staging`;
  try {
    const dl = await downloadDashboardTar(p.downloadPath, tarPath);
    if (!dl.ok) return { ok: false, error: dl.error };

    // Stage first: a corrupt archive or full disk fails with the live world
    // intact (dashboard restore semantics, mirrored).
    fs.rmSync(stagingDir, { recursive: true, force: true });
    await runTar(["-xf", tarPath, "-C", stagingDir]);
    const stagedEntries = fs.readdirSync(stagingDir);
    if (stagedEntries.length === 0) {
      return { ok: false, error: "Restored archive staged empty — refusing to touch the live world." };
    }
    const result = installStagedTree(stagingDir, destAbs, p.mode);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    try { if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath); } catch { /* best-effort */ }
  }
}

async function runTar(args: string[]): Promise<void> {
  try {
    await execFile("tar", args, { timeout: 30 * 60 * 1000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  } catch (err: any) {
    throw new Error(`tar failed (is tar on PATH?): ${err?.stderr?.toString?.() || err?.message || err}`);
  }
}

async function streamToFile(body: ReadableStream, filePath: string): Promise<void> {
  const { Readable } = await import("stream");
  const { pipeline } = await import("stream/promises");
  await pipeline(Readable.fromWeb(body as any), fs.createWriteStream(filePath));
}

async function execFileRead(serverId: string, p: FileReadCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const result = readServerFile(path.join(agentDataRoot(), p.dataDirName), p.relPath);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, output: JSON.stringify({ exists: result.exists, content: result.content }) };
}

async function execFileWrite(serverId: string, p: FileWriteCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const result = writeServerFile(path.join(agentDataRoot(), p.dataDirName), p.relPath, p.content, p.backup);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, output: JSON.stringify({ written: result.written }) };
}

async function execFileList(serverId: string, p: FileListCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const result = listServerDir(path.join(agentDataRoot(), p.dataDirName), p.relPath);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, output: JSON.stringify({ entries: result.entries }) };
}

async function execConfigApply(serverId: string, p: ConfigApplyCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const result = applyConfigEntries(path.join(agentDataRoot(), p.dataDirName), p.files);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, output: JSON.stringify({ written: result.written }) };
}

/** Download a dashboard-issued one-shot tar with HMAC path auth (shared by
 *  BACKUP_RESTORE and FILES_APPLY). Signs the full path including its query
 *  string — parity with verifyPathAuth on the dashboard. */
async function downloadDashboardTar(downloadPath: string, tarPath: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac("sha256", requireState().nodeSecret)
    .update(`${requireState().nodeId}\n${timestamp}\nGET\n${downloadPath}`)
    .digest("hex");
  const res = await fetch(`${requireState().serverUrl.replace(/\/$/, "")}${downloadPath}`, {
    headers: {
      "x-node-id": requireState().nodeId,
      "x-node-timestamp": timestamp,
      "x-node-signature": signature,
    },
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: `Download failed: ${(data as any).error ?? res.status}` };
  }
  await streamToFile(res.body!, tarPath);
  if (!fs.existsSync(tarPath) || fs.statSync(tarPath).size === 0) {
    return { ok: false, error: "Downloaded archive was empty." };
  }
  return { ok: true };
}

async function execFilesApply(serverId: string, p: FilesApplyCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const dataDir = path.join(agentDataRoot(), p.dataDirName);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  const tarPath = path.join(stateDir, `ship-${serverId}-${Date.now()}.tar`);
  const stagingDir = path.join(stateDir, `ship-${serverId}-${Date.now()}.staging`);
  let snapshotId: string | undefined;

  // After the snapshot exists, every failure output carries its id so the
  // dashboard can roll the partial apply back.
  const fail = (error: string): { ok: false; error: string; output?: string } =>
    snapshotId ? { ok: false, error, output: JSON.stringify({ snapshotId }) } : { ok: false, error };

  try {
    // 1. Tar-aside the affected paths for rollback (before anything changes).
    const backups = (p.backupPaths ?? []).filter((rel) => fs.existsSync(path.join(dataDir, rel)));
    if (backups.length > 0) {
      snapshotId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const snapName = modSnapshotTarName(serverId, snapshotId);
      if (!snapName) return { ok: false, error: "Invalid snapshot id." };
      await runTar(buildTarArgs(dataDir, backups, path.join(stateDir, snapName)));
    }

    // 2. Pre-delete stale paths (updates/uninstalls ship their replacements).
    if (p.deletes && p.deletes.length > 0) {
      const del = deletePathsInDataDir(dataDir, p.deletes);
      if (!del.ok) return fail(del.error);
    }

    // 3. Pull the tar and overlay it onto the data dir.
    const dl = await downloadDashboardTar(p.downloadPath, tarPath);
    if (!dl.ok) return fail(dl.error);
    fs.mkdirSync(stagingDir, { recursive: true });
    await runTar(["-xf", tarPath, "-C", stagingDir]);
    const stagedEntries = fs.readdirSync(stagingDir);
    if (stagedEntries.length === 0) {
      return fail("Shipped archive staged empty — refusing to touch the server files.");
    }
    const result = installStagedTree(stagingDir, dataDir, "overlay");
    if (!result.ok) return fail(result.error);

    return { ok: true, output: JSON.stringify({ applied: stagedEntries.length, snapshotId }) };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    try { if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath); } catch { /* best-effort */ }
  }
}

async function execPathsSnapshot(serverId: string, p: PathsSnapshotCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const dataDir = path.join(agentDataRoot(), p.dataDirName);
  fs.mkdirSync(stateDir, { recursive: true });
  const backups = p.backupPaths.filter((rel) => {
    const abs = path.resolve(path.join(dataDir, rel));
    return abs.startsWith(path.resolve(dataDir) + path.sep) && fs.existsSync(abs);
  });
  if (backups.length === 0) return { ok: true, output: JSON.stringify({ snapshotId: undefined }) };
  const snapshotId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const snapName = modSnapshotTarName(serverId, snapshotId);
  if (!snapName) return { ok: false, error: "Invalid snapshot id." };
  try {
    await runTar(buildTarArgs(dataDir, backups, path.join(stateDir, snapName)));
  } catch (err: any) {
    return { ok: false, error: `Snapshot failed: ${err?.message ?? err}` };
  }
  return { ok: true, output: JSON.stringify({ snapshotId }) };
}

async function execFilesRestore(serverId: string, p: FilesRestoreCommandPayload): Promise<{ ok: boolean; error?: string }> {
  const dataDir = path.join(agentDataRoot(), p.dataDirName);
  const snapName = modSnapshotTarName(serverId, p.snapshotId);
  if (!snapName) return { ok: false, error: "Invalid snapshot id." };
  const snapPath = path.join(stateDir, snapName);
  if (!fs.existsSync(snapPath)) {
    return { ok: false, error: "Rollback snapshot no longer exists on this node (kept ~48h)." };
  }
  const stagingDir = path.join(stateDir, `rollback-${serverId}-${Date.now()}.staging`);
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    await runTar(["-xf", snapPath, "-C", stagingDir]);
    // Files the failed install added are cleared first when the dashboard
    // knows them; the snapshot then overlays the pre-install versions back.
    if (p.clearPaths && p.clearPaths.length > 0) {
      const del = deletePathsInDataDir(dataDir, p.clearPaths);
      if (!del.ok) return { ok: false, error: del.error };
    }
    const result = installStagedTree(stagingDir, dataDir, "overlay");
    if (!result.ok) return { ok: false, error: result.error };
    try { fs.unlinkSync(snapPath); } catch { /* best-effort */ }
    return { ok: true };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

async function execFileDelete(serverId: string, p: FileDeleteCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const result = deletePathsInDataDir(path.join(agentDataRoot(), p.dataDirName), p.paths);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, output: JSON.stringify({ deleted: result.deleted }) };
}

async function execDockerRun(serverId: string, p: DockerRunCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const dataDir = path.join(agentDataRoot(), p.dataDirName);
  fs.mkdirSync(dataDir, { recursive: true });
  const res = await docker(
    ["run", "--rm", "-v", `${dataDir}:/data`, p.image, "bash", "-lc", p.cmd],
    p.timeoutMs ?? 15 * 60 * 1000,
  );
  if (res.code !== 0) {
    return { ok: false, error: (res.stderr || res.stdout || "docker run failed").slice(-2000) };
  }
  return { ok: true, output: JSON.stringify({ output: (res.stdout + (res.stderr ? `\n${res.stderr}` : "")).slice(-4000) }) };
}

async function execDirScan(serverId: string, p: DirScanCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const result = scanTreeFor(path.join(agentDataRoot(), p.dataDirName), p.relDir, p.fileName, p.patterns);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, output: JSON.stringify({ files: result.files }) };
}

async function execTunnelStart(serverId: string, p: TunnelStartCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  fs.mkdirSync(stateDir, { recursive: true });
  const binPath = tunnelBinPath(stateDir);
  if (!fs.existsSync(binPath)) {
    await downloadToFile(p.binaryUrl, binPath);
    if (process.platform !== "win32") fs.chmodSync(binPath, 0o755);
  }
  const secretPath = tunnelSecretPath(stateDir, serverId);
  // The daemon's own config format: a single-field TOML file (SecretConfig).
  fs.writeFileSync(secretPath, `secret_key = "${p.secret}"\n`, { mode: 0o600 });

  // Replacing a live daemon for the same server: kill it first (the dashboard
  // dispatches TUNNEL_START idempotently on boot reconcile).
  await execTunnelStop(serverId, { kind: "TUNNEL_STOP" });

  const proc = spawn(binPath, [
    "--secret-path", secretPath,
    "--socket-path", tunnelSocketPath(stateDir, serverId),
  ], { cwd: stateDir, stdio: "ignore", detached: false });
  tunnelProcs.set(serverId, proc);
  try {
    fs.writeFileSync(tunnelPidPath(stateDir, serverId), String(proc.pid ?? 0));
  } catch { /* best-effort */ }
  proc.on("close", () => {
    if (tunnelProcs.get(serverId) === proc) tunnelProcs.delete(serverId);
  });

  // Give the daemon a moment — an instantly-dead binary (bad download,
  // unsupported glibc) must fail the command rather than go false-ok.
  await new Promise((r) => setTimeout(r, 2000));
  if (proc.exitCode !== null) {
    tunnelProcs.delete(serverId);
    return { ok: false, error: `playit daemon exited immediately (code ${proc.exitCode}).` };
  }
  return { ok: true, output: JSON.stringify({ pid: proc.pid ?? null }) };
}

async function execTunnelStop(serverId: string, _p: TunnelStopCommandPayload): Promise<{ ok: boolean }> {
  const proc = tunnelProcs.get(serverId);
  if (proc) {
    tunnelProcs.delete(serverId);
    try { proc.kill("SIGTERM"); } catch { /* already gone */ }
    const gone = new Promise<void>((resolve) => proc.once("close", () => resolve()));
    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* best-effort */ }
    }, 3000);
    await gone.finally(() => clearTimeout(timer));
  }
  try { fs.unlinkSync(tunnelPidPath(stateDir, serverId)); } catch { /* best-effort */ }
  return { ok: true };
}

async function execDiskUsage(serverId: string, p: DiskUsageCommandPayload): Promise<{ ok: boolean; error?: string; output?: string }> {
  const result = walkDiskUsage(path.join(agentDataRoot(), p.dataDirName), p.buckets ?? []);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, output: JSON.stringify(result.usage) };
}

async function executeCommand(cmd: SyncCommand): Promise<{ commandId: string; ok: boolean; error?: string; output?: string }> {
  try {
    let result: { ok: boolean; error?: string; output?: string };
    switch (cmd.payload.kind) {
      case "START": result = await execStart(cmd.serverId, cmd.payload); break;
      case "STOP": result = await execStop(cmd.serverId, cmd.payload); break;
      case "UPDATE": result = await execUpdate(cmd.serverId, cmd.payload); break;
      case "SEND_COMMAND": result = await execSendCommand(cmd.serverId, cmd.payload); break;
      case "BACKUP_CREATE": result = await execBackupCreate(cmd.serverId, cmd.payload); break;
      case "BACKUP_RESTORE": result = await execBackupRestore(cmd.serverId, cmd.payload); break;
      case "FILE_READ": result = await execFileRead(cmd.serverId, cmd.payload); break;
      case "FILE_WRITE": result = await execFileWrite(cmd.serverId, cmd.payload); break;
      case "FILE_LIST": result = await execFileList(cmd.serverId, cmd.payload); break;
      case "CONFIG_APPLY": result = await execConfigApply(cmd.serverId, cmd.payload); break;
      case "FILES_APPLY": result = await execFilesApply(cmd.serverId, cmd.payload); break;
      case "FILES_RESTORE": result = await execFilesRestore(cmd.serverId, cmd.payload); break;
      case "FILE_DELETE": result = await execFileDelete(cmd.serverId, cmd.payload); break;
      case "DOCKER_RUN": result = await execDockerRun(cmd.serverId, cmd.payload); break;
      case "DIR_SCAN": result = await execDirScan(cmd.serverId, cmd.payload); break;
      case "PATHS_SNAPSHOT": result = await execPathsSnapshot(cmd.serverId, cmd.payload); break;
      case "TUNNEL_START": result = await execTunnelStart(cmd.serverId, cmd.payload); break;
      case "TUNNEL_STOP": result = await execTunnelStop(cmd.serverId, cmd.payload); break;
      case "DISK_USAGE": result = await execDiskUsage(cmd.serverId, cmd.payload); break;
      default: result = { ok: false, error: `Unknown command kind` };
    }
    return { commandId: cmd.id, ...result };
  } catch (err: any) {
    return { commandId: cmd.id, ok: false, error: err?.message ?? String(err) };
  }
}

// ---------------------------------------------------------------------------
// Reporting + sync loop

// Enrollment state, set once at startup (register or run) — command
// executors reach the dashboard through it.
let agentState: AgentState | null = null;
function requireState(): AgentState {
  if (!agentState) throw new Error("Agent not enrolled.");
  return agentState;
}

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
    tunnelsAlive: Array.from(tunnelProcs.keys()),
  };

  const raw = JSON.stringify(body);
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", state.nodeSecret)
    .update(`${requireState().nodeId}\n${timestamp}\n${raw}`)
    .digest("hex");

  let res: Response;
  try {
    res = await fetch(`${requireState().serverUrl.replace(/\/$/, "")}/api/agents/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-node-id": requireState().nodeId,
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
  const expectedSig = crypto.createHmac("sha256", requireState().nodeSecret).update(rawResponse).digest("hex");
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
  agentState = state;
  console.log(`Agent ${agentVersion} running for node ${state.nodeId} → ${state.serverUrl}`);
  const dockerVer = await dockerVersion();
  console.log(dockerVer ? `Docker ${dockerVer} detected.` : "WARNING: Docker daemon not reachable — commands will fail.");
  cleanupStaleModSnapshots();
  reconcileTunnelOrphans(stateDir, tunnelProcs);
  for (;;) {
    try {
      await syncOnce(state, agentVersion);
    } catch (err: any) {
      console.error(`[loop] sync error: ${err?.message ?? err}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Rollback tars from FILES_APPLY are for immediate-failure rollbacks —
 *  anything older than two days is debris from a dead dashboard process. */
function cleanupStaleModSnapshots(): void {
  try {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(stateDir)) {
      if (!/^modsnap-.*\.tar$/.test(name)) continue;
      const full = path.join(stateDir, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
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
    agentState = { serverUrl: args.server, nodeId: reg.nodeId, nodeSecret: reg.nodeSecret };
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
