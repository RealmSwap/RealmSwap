import path from "path";
import net from "net";
import { Server } from "@/generated/client";
import { ServerRunner, ProcessStats } from "./types";
import { docker, dockerSpawn, buildRunArgs, buildContainerStartEntrypoint, parseDockerStats } from "./docker/dockerCli";
import { prisma } from "../db";
import { dataRoot, dockerMountRoot } from "../appPaths";
import { parseSpec } from "../definitions/serialize";
import { buildContext } from "../definitions/context";
import { planContainer, planPorts, planInstall } from "../definitions/plan";
import { applyConfigFiles } from "../definitions/applyConfigFiles";
import { appendLog, clearLogs, getServerLogTail } from "../serverLogs";
import { serverEventBus } from "../eventBus";
import { markFirstOnline } from "../firstOnline";
import { setProgress, clearProgress, parseSteamProgress } from "../downloadProgress";
import { startMonitoring, stopMonitoring, clearStatsHistory } from "../processMonitor";
import { assertNoTmlForContainerRunner } from "../mods/tml";
import { isCrashExit, evaluateCrash, CRASH_MAX_RETRIES, type CrashCounter } from "../crashPolicy";
import type { GameDefinitionSpec, InstallMethod } from "../definitions/types";
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
// Where this process reads/writes server files (configs, logs). Under
// GAMEVAULT_DATA_DIR, or cwd in dev.
function serverDataDir(serverId: string): string {
  return path.join(dataRoot(), "local-servers", serverId);
}
// Path prefix to hand the Docker daemon as the bind-mount SOURCE. When the
// dashboard itself is containerized, dataRoot() is container-internal and
// meaningless to the host daemon — dockerMountRoot() (GAMEVAULT_HOST_DATA_DIR)
// is the host-side path of the same volume.
function dockerMountSource(serverId: string): string {
  return path.join(dockerMountRoot(), "local-servers", serverId);
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
  if (status === "RUNNING") {
    // First-ever readiness — feeds the dashboard's first-boot celebration.
    markFirstOnline(serverId).catch(() => {});
  }
  return prisma.server
    .update({ where: { id: serverId }, data: { status, ...(status === "RUNNING" ? { pendingRestart: false } : {}), ...extra } })
    .then(() => serverEventBus.emit("status_update", { serverId, status }))
    .catch(() => {});
}

export class DockerRunner implements ServerRunner {
  async install(): Promise<void> {
    // Install is implicit: the container entrypoint runs the install step
    // (SteamCMD app_update or first-boot download) on every start (see
    // buildContainerStartEntrypoint). Nothing to do here.
  }

  async start(server: Server): Promise<void> {
    const serverId = server.id;
    if (followers.has(serverId)) return; // already running under this process

    const record = await prisma.server.findUnique({ where: { id: serverId } });
    if (!record) throw new Error("Server record not found in database.");

    const { spec, installMethod } = await resolveDefinition(record);
    if (installMethod !== "STEAMCMD" && installMethod !== "DOWNLOAD") {
      throw new Error("Docker runner currently supports SteamCMD and download games only.");
    }
    const ctx = buildContext({
      name: record.name, password: record.password, port: record.port,
      ram: record.ramAllocation, paramValuesJson: record.paramValues, spec,
    });

    const container = planContainer(spec, ctx);
    if (!container) {
      throw new Error(`${record.game} has no container definition; it can only run with the Local runner.`);
    }
    const installPlan = planInstall(spec, installMethod as InstallMethod);
    const ports = planPorts(spec, ctx);

    clearLogs(serverId);
    await setStatus(serverId, "STARTING", { pid: null, cpuUsage: 0, memoryUsage: 0 });
    setProgress(serverId, { phase: "steam", percent: null, label: "Preparing container…" });

    // Write config files onto the server data dir (reuses existing writers).
    const baseDir = serverDataDir(serverId);
    // A tModLoader Terraria server must not silently boot vanilla in a
    // container — the marker only swaps the launch on the Windows runner.
    assertNoTmlForContainerRunner(baseDir);
    const installDir = container.installSubDir ? path.join(baseDir, container.installSubDir) : baseDir;
    fs.mkdirSync(installDir, { recursive: true });
    applyConfigFiles(spec, ctx, { installDir, server: { name: record.name, password: record.password } });

    // Remove any stale container so start is idempotent.
    await docker(["rm", "-f", containerName(serverId)]);

    const entrypoint = buildContainerStartEntrypoint(installPlan, container);
    const runArgs = buildRunArgs({
      containerName: containerName(serverId),
      image: container.image,
      hostDataDir: dockerMountSource(serverId),
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
    this.attachFollower(serverId, spec, ports.filter((p) => p.protocol === "TCP").map((p) => p.port));
    this.attachExitWatcher(serverId, record.game, record.ramAllocation);
    startMonitoring(record, this);
  }

  // Follow container stdout: persist to server.log, drive the download-progress
  // bar (SteamCMD output), and detect readiness via the spec's readyPattern or
  // its declared TCP ports — same evidence contract as LocalRunner.
  private attachFollower(serverId: string, spec: GameDefinitionSpec, tcpPorts: number[] = []) {
    const follower = dockerSpawn(["logs", "-f", "--tail", "0", containerName(serverId)]);
    followers.set(serverId, follower);

    const readyPattern = spec.launch.readyPattern ? new RegExp(spec.launch.readyPattern, "i") : null;
    let ready = false;
    const markReady = (reason: string) => {
      if (intentionalStops.has(serverId)) return;
      if (ready) return;
      ready = true;
      clearProgress(serverId);
      if (portPoll) clearInterval(portPoll);
      appendLog(serverId, `[Readiness Check] Server is ready (${reason})`);
      setStatus(serverId, "RUNNING");
    };

    // Split lines across chunk boundaries must still match — a fragmented
    // "Done (…)"/ready line tested per-chunk silently never matches and costs
    // the blind fallback (found by the GUI e2e on CI). Buffer like LocalRunner.
    let outputBuffer = "";
    const onChunk = (buf: Buffer) => {
      const s = buf.toString();
      appendLog(serverId, s);
      const pct = parseSteamProgress(s.replace(/[\r\n]+/g, " "));
      if (pct !== null && !ready) {
        setProgress(serverId, { phase: "steam", percent: pct, label: `Downloading ${Math.round(pct)}%` });
      }
      if (readyPattern && !ready) {
        outputBuffer += s;
        if (outputBuffer.length > 8192) outputBuffer = outputBuffer.slice(-8192);
        if (readyPattern.test(outputBuffer)) markReady(`Matched log pattern: ${spec.launch.readyPattern}`);
      }
    };
    follower.stdout?.on("data", onChunk);
    follower.stderr?.on("data", onChunk);

    // Games that declare a TCP port get honest port-based readiness: MC has no
    // readyPattern, so without this its only evidence under Docker was the
    // 5-minute blind flip below (users saw "Starting…" for 5 minutes).
    let portPoll: NodeJS.Timeout | undefined;
    if (tcpPorts.length > 0) {
      portPoll = setInterval(() => {
        if (ready) return;
        const socket = net.connect({ port: tcpPorts[0], host: "127.0.0.1" });
        socket.setTimeout(2000);
        socket.on("connect", () => {
          socket.destroy();
          markReady(`TCP Port ${tcpPorts[0]} is accepting connections`);
        }).on("error", () => {
          socket.destroy();
        }).on("timeout", () => {
          socket.destroy();
        });
      }, 5000);
    }

    // Fallback: mark ready after 5 minutes even without any evidence match.
    const timeout = setTimeout(() => markReady("5-minute fallback timeout reached"), 5 * 60 * 1000);
    follower.on("close", () => {
      clearTimeout(timeout);
      if (portPoll) clearInterval(portPoll);
    });
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

      // Persist the crash for per-server crash history, matching the Local runner.
      await prisma.activityLog.create({
        data: {
          userId: rec.userId,
          serverId,
          action: "SERVER_CRASH",
          details: `Container '${rec.name}' (${rec.game}) exited with code ${code}. Auto-restart attempt ${counter.count}/${CRASH_MAX_RETRIES}.`,
          metadata: JSON.stringify({
            exitCode: code,
            attempt: counter.count,
            maxRetries: CRASH_MAX_RETRIES,
          }),
        }
      }).catch(err => console.error("Failed to write crash activity log:", err));

      // Alert on every crash, matching the Local runner's behavior.
      import("../notifications").then(({ sendNotification }) => {
        sendNotification(
          rec.userId,
          "⚠️ Server Crashed",
          shouldRestart
            ? `Your container '${rec.name}' exited (code ${code}). Auto-restarting (${counter.count}/${CRASH_MAX_RETRIES})…`
            : `Your container '${rec.name}' exited (code ${code}) and exhausted all auto-restart attempts.`,
          { serverId }
        );
      }).catch(err => console.error("Failed to load notifications module:", err));

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
            // Dynamic import — actionScheduler pulls the runner chain via the action registry.
            import("../actionScheduler").then(({ fireServerCrashAutomations }) =>
              fireServerCrashAutomations(serverId)
            ).catch(err => console.error("Failed to fire crash automations:", err));
            import("../notifications").then(({ sendNotification }) => {
              sendNotification(
                rec.userId,
                "🛑 Auto-restart failed",
                `Your container '${rec.name}' crashed and the automatic restart failed: ${e.message}`,
                { serverId }
              );
            }).catch(err => console.error("Failed to load notifications module:", err));
          }
        }, 5000);
        return;
      }
      appendLog(serverId, `[Crash Detection] Max retries (${CRASH_MAX_RETRIES}) exhausted. Marking server as CRASHED.`);
      await setStatus(serverId, "CRASHED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
      // Dynamic import — actionScheduler pulls the runner chain via the action registry.
      import("../actionScheduler").then(({ fireServerCrashAutomations }) =>
        fireServerCrashAutomations(serverId)
      ).catch(err => console.error("Failed to fire crash automations:", err));
      return; // notification already sent in the shared crash-alert block above
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
      "-v", `${dockerMountSource(serverId)}:/data`,
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
      "exec", containerName(server.id), "bash", "-c",
      'printf "%s\\n" "$1" > /proc/1/fd/0', "_", command,
    ]);
    if (res.code !== 0) throw new Error(`Failed to send command to container: ${res.stderr || res.stdout}`);
  }

  async getStats(server: Server): Promise<ProcessStats> {
    const res = await docker(
      ["stats", containerName(server.id), "--no-stream", "--format", "{{.CPUPerc}},{{.MemUsage}}"],
      { timeoutMs: 8000 },
    );
    if (res.code !== 0) {
      // Match the Local runner: a daemon/container failure must reach the
      // monitor's error path (healthStatus DEGRADED after 3 misses) instead
      // of silently recording fake 0% / 0 MB telemetry.
      throw new Error(`Docker stats failed: ${res.stderr || res.stdout || "unknown error"}`);
    }
    if (!res.stdout.trim()) return { cpuPercent: 0, memoryMB: 0 };
    return parseDockerStats(res.stdout);
  }

  async getLogs(server: Server): Promise<string> {
    return getServerLogTail(server.id);
  }

  // Containers survive an app restart; this process's log follower, exit
  // watcher, and monitor do not. Without this, a container that exits after
  // the restart keeps status RUNNING forever and crashes go unnoticed.
  // Mirrors reconcileTunnelsOnBoot for the tunnel world.
  async reconcileOnBoot(): Promise<void> {
    const servers = await prisma.server.findMany({
      where: { runnerType: "DOCKER", status: { in: ["RUNNING", "STARTING"] } },
    });
    for (const server of servers) {
      try {
        const res = await docker(["inspect", "-f", "{{.State.Running}}", containerName(server.id)]);
        if (res.code === 0 && res.stdout.trim() === "true") {
          const record = await prisma.server.findUnique({ where: { id: server.id } });
          if (!record) continue;
          const { spec } = await resolveDefinition(record);
          appendLog(server.id, "[Docker] Reattached to running container after app restart.");
          const reattachCtx = buildContext({
            name: record.name, password: record.password, port: record.port,
            ram: record.ramAllocation, paramValuesJson: record.paramValues, spec,
          });
          this.attachFollower(
            server.id,
            spec,
            planPorts(spec, reattachCtx).filter((p) => p.protocol === "TCP").map((p) => p.port)
          );
          this.attachExitWatcher(server.id, record.game, record.ramAllocation);
          startMonitoring(record, this);
        } else {
          await setStatus(server.id, "STOPPED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
          appendLog(server.id, "[Docker] Container not found after app restart — marked stopped.");
        }
      } catch (err: any) {
        // Never block boot on reconcile problems; the container itself is
        // untouched either way.
        console.error(`[Docker] Boot reconcile failed for ${server.id}:`, err?.message);
      }
    }
  }
}
