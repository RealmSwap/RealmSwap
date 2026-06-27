import path from "path";
import { Server, GameDefinition } from "@/generated/client";
import { ServerRunner, ProcessStats } from "./types";
import { docker, dockerSpawn, buildRunArgs, buildStartEntrypoint, parseDockerStats } from "./docker/dockerCli";
import { prisma } from "../db";
import { dataRoot } from "../appPaths";
import { parseSpec } from "../definitions/serialize";
import { buildContext } from "../definitions/context";
import { planContainer, planConfigFiles, planPorts, planInstall } from "../definitions/plan";
import { writeStrategyConfig } from "../definitions/strategies";
import { appendLog, clearLogs, getServerLogTail } from "../serverLogs";
import { serverEventBus } from "../eventBus";
import { setProgress, clearProgress, parseSteamProgress } from "../downloadProgress";
import { startMonitoring, stopMonitoring, clearStatsHistory } from "../processMonitor";
import { isCrashExit, evaluateCrash, CRASH_MAX_RETRIES, type CrashCounter } from "../crashPolicy";
import type { GameDefinitionSpec } from "../definitions/types";
import fs from "fs";

// Per-server helper processes (log follower + exit watcher), tracked on globalThis
// so they survive Next.js dev hot-reloads, mirroring localProcesses in the local runner.
const g = globalThis as unknown as {
  dockerFollowers: Map<string, import("child_process").ChildProcess> | undefined;
  dockerIntentionalStops: Set<string> | undefined;
  dockerCrashCounters: Map<string, CrashCounter> | undefined;
};
if (!g.dockerFollowers) g.dockerFollowers = new Map();
if (!g.dockerIntentionalStops) g.dockerIntentionalStops = new Set();
if (!g.dockerCrashCounters) g.dockerCrashCounters = new Map();
const followers = g.dockerFollowers;
const intentionalStops = g.dockerIntentionalStops;
const crashCounters = g.dockerCrashCounters;

function containerName(serverId: string): string {
  return `realmswap-server-${serverId}`;
}
function hostDataDir(serverId: string): string {
  return path.join(dataRoot(), "local-servers", serverId);
}

async function resolveDefinition(server: { definitionId: string | null; game: string }):
  Promise<{ spec: GameDefinitionSpec; installMethod: string }> {
  const record = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  if (!record) throw new Error(`No game definition found for server (game=${server.game}).`);
  return { spec: parseSpec(record.spec), installMethod: record.installMethod };
}

function setStatus(serverId: string, status: string, extra: Record<string, unknown> = {}) {
  return prisma.server
    .update({ where: { id: serverId }, data: { status, ...extra } })
    .then(() => serverEventBus.emit("status_update", { serverId, status }))
    .catch(() => {});
}

export class DockerRunner implements ServerRunner {
  async install(): Promise<void> {
    // Install is implicit: the container entrypoint runs `steamcmd +app_update`
    // on every start (see buildStartEntrypoint). Nothing to do here.
  }

  async start(server: Server): Promise<void> {
    const serverId = server.id;
    if (followers.has(serverId)) return; // already running under this process

    const record = await prisma.server.findUnique({ where: { id: serverId } });
    if (!record) throw new Error("Server record not found in database.");

    const { spec, installMethod } = await resolveDefinition(record);
    if (installMethod !== "STEAMCMD") {
      throw new Error("Docker runner currently supports SteamCMD games only.");
    }
    const ctx = buildContext({
      name: record.name, password: record.password, port: record.port,
      ram: record.ramAllocation, paramValuesJson: record.paramValues, spec,
    });

    const container = planContainer(spec, ctx);
    if (!container) {
      throw new Error(`${record.game} has no container definition; it can only run with the Local runner.`);
    }
    const installPlan = planInstall(spec, "STEAMCMD");
    const ports = planPorts(spec, ctx);

    clearLogs(serverId);
    await setStatus(serverId, "STARTING", { pid: null, cpuUsage: 0, memoryUsage: 0 });
    setProgress(serverId, { phase: "steam", percent: null, label: "Preparing container…" });

    // Write config files onto the host bind-mount path (reuses existing writers).
    const baseDir = hostDataDir(serverId);
    const installDir = container.installSubDir ? path.join(baseDir, container.installSubDir) : baseDir;
    fs.mkdirSync(installDir, { recursive: true });
    for (const cf of planConfigFiles(spec, ctx)) {
      const full = path.join(installDir, cf.relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (cf.strategy === "template") {
        fs.writeFileSync(full, cf.content ?? "");
      } else {
        writeStrategyConfig({
          strategy: cf.strategy as "enshroudedJson" | "zomboidIniMerge",
          installDir, serverName: record.name, password: record.password || undefined,
        });
      }
    }

    // Remove any stale container so start is idempotent.
    await docker(["rm", "-f", containerName(serverId)]);

    const entrypoint = buildStartEntrypoint(
      installPlan.appId!, container.installSubDir, container.executable, container.args,
    );
    const runArgs = buildRunArgs({
      containerName: containerName(serverId),
      image: container.image,
      hostDataDir: baseDir,
      ports,
      env: container.env,
      entrypoint,
    });

    const res = await docker(runArgs);
    if (res.code !== 0) {
      clearProgress(serverId);
      appendLog(serverId, `[Docker] Failed to start container: ${res.stderr || res.stdout}`);
      await setStatus(serverId, "STOPPED", { pid: null });
      throw new Error(`Failed to start Docker container: ${res.stderr || res.stdout || "unknown error"}`);
    }

    appendLog(serverId, `[Docker] Container ${containerName(serverId)} started. Pulling/validating game files via SteamCMD…`);
    this.attachFollower(serverId, spec);
    this.attachExitWatcher(serverId, record.game, record.ramAllocation);
    startMonitoring(record);
  }

  // Follow container stdout: persist to server.log, drive the download-progress
  // bar (SteamCMD output), and detect readiness via the spec's readyPattern.
  private attachFollower(serverId: string, spec: GameDefinitionSpec) {
    const follower = dockerSpawn(["logs", "-f", "--tail", "0", containerName(serverId)]);
    followers.set(serverId, follower);

    const readyPattern = spec.launch.readyPattern ? new RegExp(spec.launch.readyPattern, "i") : null;
    let ready = false;
    const markReady = (reason: string) => {
      if (intentionalStops.has(serverId)) return;
      if (ready) return;
      ready = true;
      clearProgress(serverId);
      appendLog(serverId, `[Readiness Check] Server is ready (${reason})`);
      setStatus(serverId, "RUNNING");
    };

    const onChunk = (buf: Buffer) => {
      const s = buf.toString();
      appendLog(serverId, s);
      const pct = parseSteamProgress(s.replace(/[\r\n]+/g, " "));
      if (pct !== null && !ready) {
        setProgress(serverId, { phase: "steam", percent: pct, label: `Downloading ${Math.round(pct)}%` });
      }
      if (readyPattern && readyPattern.test(s)) markReady(`Matched log pattern: ${spec.launch.readyPattern}`);
    };
    follower.stdout?.on("data", onChunk);
    follower.stderr?.on("data", onChunk);

    // Fallback: mark ready after 5 minutes even without a pattern match.
    const timeout = setTimeout(() => markReady("5-minute fallback timeout reached"), 5 * 60 * 1000);
    follower.on("close", () => clearTimeout(timeout));
  }

  // Watch for container exit and route it through the shared crash policy.
  private attachExitWatcher(serverId: string, game: string, ram: number) {
    const waiter = dockerSpawn(["wait", containerName(serverId)]);
    let out = "";
    waiter.stdout?.on("data", (b) => (out += b.toString()));
    waiter.on("close", () => {
      const exitCode = parseInt(out.trim(), 10);
      this.handleContainerExit(serverId, isNaN(exitCode) ? null : exitCode, game, ram);
    });
  }

  private async handleContainerExit(serverId: string, code: number | null, game: string, ram: number) {
    const follower = followers.get(serverId);
    if (follower) { try { follower.kill(); } catch { /* ignore */ } }
    followers.delete(serverId);
    stopMonitoring(serverId);
    clearProgress(serverId);

    const wasIntentional = intentionalStops.has(serverId);
    intentionalStops.delete(serverId);
    const isCrash = isCrashExit(wasIntentional, code);

    const rec = await prisma.server.findUnique({ where: { id: serverId } }).catch(() => null);
    if (!rec) return;

    if (isCrash) {
      const { counter, shouldRestart } = evaluateCrash(crashCounters.get(serverId), Date.now());
      crashCounters.set(serverId, counter);
      appendLog(serverId, `[Crash Detection] Container exited with code ${code} (Attempt ${counter.count}/${CRASH_MAX_RETRIES})`);
      if (shouldRestart) {
        appendLog(serverId, "[Crash Detection] Auto-restarting in 5 seconds...");
        await setStatus(serverId, "STARTING", { pid: null, cpuUsage: 0, memoryUsage: 0 });
        setTimeout(async () => {
          try {
            clearStatsHistory(serverId);
            const fresh = await prisma.server.findUnique({ where: { id: serverId } });
            if (fresh) await this.start(fresh);
          } catch (e: any) {
            appendLog(serverId, `[Crash Detection] Auto-restart failed: ${e.message}`);
            await setStatus(serverId, "CRASHED", { pid: null });
          }
        }, 5000);
        return;
      }
      appendLog(serverId, `[Crash Detection] Max retries (${CRASH_MAX_RETRIES}) exhausted. Marking server as CRASHED.`);
      await setStatus(serverId, "CRASHED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
      return;
    }

    await setStatus(serverId, "STOPPED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
    appendLog(serverId, `Container exited with code ${code}.`);
  }

  async stop(server: Server): Promise<void> {
    const serverId = server.id;
    intentionalStops.add(serverId);
    crashCounters.delete(serverId);

    // Best-effort graceful in-game shutdown if the spec defines a stdin command.
    try {
      const { spec } = await resolveDefinition(server);
      const stopCmd = spec.launch.stdinStopCommand;
      if (stopCmd) await this.sendCommand(server, stopCmd.replace(/\n$/, ""));
    } catch { /* fall through to docker stop */ }

    const res = await docker(["stop", containerName(serverId)]);
    if (res.code !== 0 && !/no such container/i.test(res.stderr)) {
      throw new Error(`Failed to stop Docker container: ${res.stderr || res.stdout}`);
    }
    // The exit watcher updates status/DB on container exit. If the container was
    // already gone, ensure the DB reflects STOPPED.
    if (!followers.has(serverId)) {
      await setStatus(serverId, "STOPPED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
    }
  }

  async update(server: Server): Promise<void> {
    const serverId = server.id;
    const record = await prisma.server.findUnique({ where: { id: serverId } });
    if (!record) throw new Error("Server not found");
    const { spec, installMethod } = await resolveDefinition(record);
    if (installMethod !== "STEAMCMD") throw new Error("Updates are only supported for SteamCMD games.");
    const ctx = buildContext({
      name: record.name, password: record.password, port: record.port,
      ram: record.ramAllocation, paramValuesJson: record.paramValues, spec,
    });
    const container = planContainer(spec, ctx);
    const installPlan = planInstall(spec, "STEAMCMD");
    if (!container) throw new Error("No container definition for this game.");

    await setStatus(serverId, "UPDATING");
    appendLog(serverId, `[Update] Running SteamCMD app_update for ${record.game}…`);
    const cmd =
      `steamcmd +force_install_dir /data/${container.installSubDir} +login anonymous` +
      ` +app_update ${installPlan.appId} validate +quit`;
    const res = await docker([
      "run", "--rm",
      "-v", `${hostDataDir(serverId)}:/data`,
      container.image, "bash", "-lc", cmd,
    ]);
    if (res.code !== 0) {
      await setStatus(serverId, "STOPPED");
      throw new Error(`SteamCMD update failed: ${res.stderr || res.stdout}`);
    }
    appendLog(serverId, "[Update] Update completed successfully.");
    await setStatus(serverId, "STOPPED");
  }

  async sendCommand(server: Server, command: string): Promise<void> {
    const res = await docker([
      "exec", containerName(server.id), "bash", "-lc",
      `printf '%s\\n' ${JSON.stringify(command)} > /proc/1/fd/0`,
    ]);
    if (res.code !== 0) throw new Error(`Failed to send command to container: ${res.stderr || res.stdout}`);
  }

  async getStats(server: Server): Promise<ProcessStats> {
    const res = await docker(
      ["stats", containerName(server.id), "--no-stream", "--format", "{{.CPUPerc}},{{.MemUsage}}"],
      { timeoutMs: 8000 },
    );
    if (res.code !== 0 || !res.stdout.trim()) return { cpuPercent: 0, memoryMB: 0 };
    return parseDockerStats(res.stdout);
  }

  async getLogs(server: Server): Promise<string> {
    return getServerLogTail(server.id);
  }
}
