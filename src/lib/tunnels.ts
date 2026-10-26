import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import { spawn, ChildProcess } from "child_process";
import { dataRoot } from "./appPaths";
import { prisma } from "./db";
import {
  PlayitApi,
  findTunnelForPort,
  isPlayitFailure,
  TunnelForPort,
} from "./playitApi";
import { enqueueCommand, resolveUsableNode, awaitCommandResult } from "./agents/commands";
import { NODE_ONLINE_WINDOW_MS, type CommandPayload } from "./agents/protocol";

const BIN_DIR = path.join(dataRoot(), "bin");
const DOWNLOAD_TIMEOUT_MS = 60_000;
// The playit daemon refreshes rundata every 3s; matching that cadence keeps
// our mirror of the tunnel state honest without meaningful extra load.
const RUNDATA_POLL_MS = 3_000;
const CLAIM_POLL_MS = 2_000;
const CLAIM_CODE_REGENERATIONS_MAX = 3;

// Map of running tunnels (serverId -> ChildProcess)
const runningTunnels = new Map<string, ChildProcess>();
// ServerIds with a lifecycle in flight (download, claim, spawn) — guards the
// double-start race between e.g. the start route and the settings toggle.
const startingTunnels = new Set<string>();
// ServerIds whose stop was requested — cancels the background lifecycle
// (claim polling, rundata sync) even before any agent process exists.
const lifecycleCancelled = new Set<string>();
// ServerIds whose agent exit was requested — distinguishes an expected exit
// from a crash so the close handler only alerts on the latter.
const intentionalStops = new Set<string>();
// Node-reported live tunnel daemons (serverId -> last heartbeat that said
// so). Heartbeats carry the FULL alive set, refreshed every sync.
const agentAliveTunnels = new Map<string, number>();

/** The agent heartbeat is authoritative for node tunnels — the full alive
 *  set replaces whatever we believed. Called from the sync route. */
export function noteAgentTunnels(aliveServerIds: string[]): void {
  const seen = new Set(aliveServerIds);
  for (const id of Array.from(agentAliveTunnels.keys())) {
    if (!seen.has(id)) agentAliveTunnels.delete(id);
  }
  for (const id of Array.from(seen)) agentAliveTunnels.set(id, Date.now());
}

/** True when a playit agent for this server is alive — a local daemon in
 *  THIS process, or a node daemon reported by its heartbeat recently (the
 *  45s online window bounds staleness). DB `tunnelUrl` alone is not proof of
 *  life (it can go stale after a crash), so callers in the API process use
 *  this for honest status. */
export function isTunnelAlive(serverId: string): boolean {
  if (runningTunnels.has(serverId)) return true;
  const lastSeen = agentAliveTunnels.get(serverId);
  return lastSeen !== undefined && Date.now() - lastSeen <= NODE_ONLINE_WINDOW_MS;
}

/** Release asset for a platform/arch, or null when playit publishes none
 *  (no macOS build exists on GitHub releases — checked across every release
 *  object of playit-cloud/playit-agent). Pure so the AGENT flow can resolve
 *  the NODE's platform (its heartbeat reports platform/arch). */
export function playitReleaseFor(platform: string, arch: string): { url: string; binName: string } | null {
  if (platform === "win32" && (arch === "x64" || arch === "arm64")) {
    return {
      url: "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64.exe",
      binName: "playit.exe",
    };
  }
  if (platform === "linux" && arch === "x64") {
    return {
      url: "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64",
      binName: "playit",
    };
  }
  return null;
}

function httpsGet(url: string, timeoutMs: number): Promise<import("http").IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => resolve(res));
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms: ${url}`)));
    req.on("error", reject);
  });
}

export async function downloadPlayitBinary(): Promise<string> {
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

  const release = playitReleaseFor(os.platform(), os.arch());
  if (!release) {
    throw new Error(`Unsupported OS/Arch for Playit auto-tunneling: ${os.platform()}/${os.arch()}`);
  }

  const binPath = path.join(BIN_DIR, release.binName);

  if (fs.existsSync(binPath)) {
    return binPath;
  }

  console.log(`[Tunnel] Downloading playit binary from ${release.url}...`);

  // Download to a .part file and rename into place, checking every response
  // status: piping an error page into binPath and chmod-ing it would plant a
  // corrupt binary that existsSync() then trusts forever.
  const partPath = `${binPath}.part`;
  try {
    let response = await httpsGet(release.url, DOWNLOAD_TIMEOUT_MS);
    if (response.statusCode === 301 || response.statusCode === 302) {
      const location = response.headers.location;
      if (!location) throw new Error("Download redirect had no target location.");
      response = await httpsGet(location, DOWNLOAD_TIMEOUT_MS);
    }
    if (response.statusCode !== 200) {
      throw new Error(`Download failed with HTTP ${response.statusCode} for ${release.url}.`);
    }

    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(partPath);
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
      response.on("error", reject);
    });

    if (os.platform() !== "win32") fs.chmodSync(partPath, "755");
    fs.renameSync(partPath, binPath);
    console.log("[Tunnel] Playit download complete.");
    return binPath;
  } catch (err) {
    try { if (fs.existsSync(partPath)) fs.unlinkSync(partPath); } catch (_) {}
    throw err;
  }
}

export interface TunnelStartResult {
  ok: boolean;
  /** Set when ok is false — user-presentable reason. */
  error?: string;
}

function tunnelDir(serverId: string): string {
  return path.join(dataRoot(), "playit", serverId);
}

function secretPath(serverId: string): string {
  return path.join(tunnelDir(serverId), "playit.toml");
}

/** The daemon defaults to a system-wide named pipe / /run socket that would
 *  collide with any independently installed playit — isolate per server. */
function agentSocketPath(serverId: string): string {
  return os.platform() === "win32"
    ? `\\\\.\\pipe\\realmswap-playitd-${serverId}`
    : path.join(tunnelDir(serverId), "playitd.sock");
}

function readPlayitSecret(serverId: string): string | null {
  try {
    const raw = fs.readFileSync(secretPath(serverId), "utf8");
    const toml = raw.match(/secret_key\s*=\s*"([^"]+)"/);
    const secret = (toml ? toml[1] : raw).trim();
    return /^[A-Za-z0-9_-]{16,}$/.test(secret) ? secret : null;
  } catch {
    return null;
  }
}

function writePlayitSecret(serverId: string, secret: string): void {
  const dir = tunnelDir(serverId);
  fs.mkdirSync(dir, { recursive: true });
  // The daemon's own config format: a single-field TOML file (SecretConfig).
  fs.writeFileSync(secretPath(serverId), `secret_key = "${secret}"\n`, { mode: 0o600 });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spawn the playit agent for a server and drive its whole setup over the
 * playit REST API: an unclaimed agent gets a claim link (stored on the server
 * row and shown in Join Info); once the user approves it RealmSwap exchanges
 * the claim for an agent secret, spawns playitd with that secret, creates the
 * tunnel bound to the game port, and mirrors the assigned public address into
 * `tunnelUrl`. The address is only ever written when playit itself reports a
 * live forwarding address for our port.
 */
export async function startTunnel(serverId: string, port: number): Promise<TunnelStartResult> {
  const { prisma } = await import("@/lib/db");
  const row = await prisma.server.findUnique({ where: { id: serverId }, select: { runnerType: true } }).catch(() => null);
  if (runningTunnels.has(serverId) || startingTunnels.has(serverId)) {
    return { ok: true };
  }
  startingTunnels.add(serverId);
  lifecycleCancelled.delete(serverId);
  intentionalStops.delete(serverId);
  try {
    if (row?.runnerType === "AGENT") {
      // The game port listens on the NODE, so the playit daemon runs there
      // too (dispatched through the command queue); this dashboard only runs
      // the claim handshake and mirrors playit's rundata into tunnelUrl.
      void runAgentTunnelLifecycle(serverId, port).catch((err) => {
        console.error(`[Tunnel] Node lifecycle failed for ${serverId}:`, err?.message || err);
      });
      return { ok: true };
    }

    const binPath = await downloadPlayitBinary();

    // Runs detached: the claim can take minutes (it waits for a human to click
    // the claim link), and callers must not block on that.
    void runTunnelLifecycle(serverId, port, binPath).catch((err) => {
      console.error(`[Tunnel] Lifecycle failed for ${serverId}:`, err?.message || err);
    });
    return { ok: true };
  } catch (err: any) {
    startingTunnels.delete(serverId);
    lifecycleCancelled.delete(serverId);
    console.error("[Tunnel] Failed to start tunnel:", err);
    return { ok: false, error: err.message || String(err) };
  }
}

/** Phase 1 for both runtimes: the claim handshake — claim link on the server
 *  row, poll until a human approves, exchange for the agent secret. The
 *  secret is written to THIS machine's playit dir (the dashboard needs it to
 *  authenticate rundata polling regardless of where the daemon runs). Null
 *  when cancelled/rejected. */
async function claimServerTunnel(serverId: string, api: PlayitApi, cancelled: () => boolean): Promise<string | null> {
  let code = api.generateClaimCode();
  let regenerations = 0;
  await prisma.server.update({
    where: { id: serverId },
    data: { tunnelClaimUrl: api.claimUrl(code) },
  }).catch(() => {});
  console.log(`[Tunnel] Server ${serverId} waiting for claim: ${api.claimUrl(code)}`);

  let accepted = false;
  while (!cancelled()) {
    let state: string;
    try {
      state = await api.claimSetup(code);
    } catch (err) {
      if (isPlayitFailure(err, "CodeExpired") && regenerations < CLAIM_CODE_REGENERATIONS_MAX) {
        regenerations++;
        code = api.generateClaimCode();
        await prisma.server.update({
          where: { id: serverId },
          data: { tunnelClaimUrl: api.claimUrl(code) },
        }).catch(() => {});
        continue;
      }
      console.error(`[Tunnel] Claim poll failed for ${serverId}:`, (err as Error)?.message || err);
      await sleep(5_000);
      continue;
    }
    if (state === "UserAccepted") { accepted = true; break; }
    if (state === "UserRejected") {
      await notify(serverId, "🚫 Tunnel Setup Rejected", `The playit claim for '${serverId}' was rejected in the browser. Toggle the tunnel off and on to try again.`);
      await prisma.server.update({ where: { id: serverId }, data: { tunnelClaimUrl: null } }).catch(() => {});
      return null;
    }
    await sleep(CLAIM_POLL_MS);
  }
  if (cancelled() || !accepted) return null;

  let secret: string | null = null;
  while (!cancelled()) {
    try {
      secret = await api.claimExchange(code);
      break;
    } catch (err) {
      if (isPlayitFailure(err, "UserRejected")) break;
      // NotAccepted right after approval is the normal race — keep polling.
      await sleep(CLAIM_POLL_MS);
    }
  }
  if (cancelled() || !secret) return null;

  writePlayitSecret(serverId, secret);
  await prisma.server.update({ where: { id: serverId }, data: { tunnelClaimUrl: null } }).catch(() => {});
  return secret;
}

/** The crash notification shared by the local close handler and the node
 *  mirror's liveness watch: DB columns cleared + a loud user notification. */
async function reportTunnelCrash(serverId: string, reason: string): Promise<void> {
  await prisma.server.update({
    where: { id: serverId },
    data: { tunnelUrl: null, tunnelClaimUrl: null, tunnelPid: null },
  }).catch(() => {});
  try {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (server) {
      const { sendNotification } = await import("./notifications");
      sendNotification(server.userId, "🕳️ Tunnel Disconnected", `The playit tunnel for '${server.name}' stopped unexpectedly (${reason}). Friends can't join through it until you re-enable it from Join Info.`);
      await prisma.activityLog.create({
        data: {
          userId: server.userId,
          serverId,
          action: "TUNNEL_CRASH",
          details: `Playit tunnel for '${server.name}' stopped unexpectedly (${reason}).`,
        },
      });
    }
  } catch (err) {
    console.error("[Tunnel] Failed to record tunnel crash:", err);
  }
}

/**
 * Phase 3 for both runtimes: mirror playit's rundata into the DB — creates
 * the binding for our game port once, writes the assigned address, and
 * clears it again if playit stops forwarding. No deadline: a slow allocation
 * must still land. `stillAlive` is the daemon-liveness signal; a live→dead
 * transition ends the loop through `onDaemonGone`.
 */
async function mirrorTunnelState(opts: {
  serverId: string;
  port: number;
  secret: string;
  api: PlayitApi;
  cancelled: () => boolean;
  stillAlive: () => boolean;
  onDaemonGone: () => Promise<void> | void;
}): Promise<void> {
  const { serverId, port, secret, api, cancelled, stillAlive, onDaemonGone } = opts;
  let createAttempted = false;
  let lastAddress: string | null = null;
  let lastDisabledNotice: string | null = null;

  while (!cancelled() && stillAlive()) {
    await sleep(RUNDATA_POLL_MS);
    if (cancelled() || !stillAlive()) break;

    try {
      const runData = await api.getRunData(secret);
      const tunnel: TunnelForPort | null = findTunnelForPort(runData, port);

      if (!tunnel) {
        // Bind the game port exactly once per run — retrying create on every
        // poll would stack duplicate tunnels while the first is pending.
        if (!createAttempted && runData.agent_id) {
          createAttempted = true;
          try {
            await api.createTcpTunnel(secret, runData.agent_id, port);
            console.log(`[Tunnel] Created tunnel for ${serverId} bound to 127.0.0.1:${port}.`);
          } catch (err) {
            console.error(`[Tunnel] Could not auto-create tunnel for ${serverId}:`, (err as Error)?.message || err);
            await notify(serverId, "⚠️ Tunnel needs one manual step", `RealmSwap couldn't create the playit tunnel for '${serverId}' automatically (${err instanceof Error ? err.message : err}). Create a TCP tunnel for local port ${port} on playit.gg — the address will appear here once done.`);
          }
        }
        if (lastAddress) {
          lastAddress = null;
          await prisma.server.update({ where: { id: serverId }, data: { tunnelUrl: null } }).catch(() => {});
        }
        continue;
      }

      if (tunnel.disabled) {
        if (lastDisabledNotice !== tunnel.disabledReason) {
          lastDisabledNotice = tunnel.disabledReason;
          console.error(`[Tunnel] Tunnel for ${serverId} is disabled: ${tunnel.disabledReason}`);
          await prisma.server.update({ where: { id: serverId }, data: { tunnelUrl: null } }).catch(() => {});
        }
        continue;
      }
      lastDisabledNotice = null;

      if (tunnel.displayAddress && tunnel.displayAddress !== lastAddress) {
        lastAddress = tunnel.displayAddress;
        await prisma.server.update({
          where: { id: serverId },
          data: { tunnelUrl: tunnel.displayAddress },
        }).catch(() => {});
        console.log(`[Tunnel] Server ${serverId} live at ${tunnel.displayAddress}.`);
      }
    } catch (err) {
      console.error(`[Tunnel] Rundata poll failed for ${serverId}:`, (err as Error)?.message || err);
    }
  }
  if (!cancelled() && !stillAlive()) await onDaemonGone();
}

async function runTunnelLifecycle(serverId: string, port: number, binPath: string): Promise<void> {
  const api = new PlayitApi();
  const cancelled = () => lifecycleCancelled.has(serverId);
  let secret = readPlayitSecret(serverId);

  try {
    // ---- Phase 1: claim (only when no agent secret exists yet) ----
    if (!secret) {
      secret = await claimServerTunnel(serverId, api, cancelled);
      if (!secret) return;
    }

    // ---- Phase 2: spawn the daemon with the secret ----
    const dir = tunnelDir(serverId);
    fs.mkdirSync(dir, { recursive: true });
    const proc = spawn(binPath, [
      "--secret-path", secretPath(serverId),
      "--socket-path", agentSocketPath(serverId),
    ], { cwd: dir, env: process.env });

    runningTunnels.set(serverId, proc);
    let exited = false;
    proc.on("close", () => { exited = true; });
    await prisma.server.update({
      where: { id: serverId },
      data: { tunnelPid: proc.pid ?? null },
    }).catch(() => {});

    proc.stderr.on("data", (data) => {
      console.error(`[Tunnel] ${serverId} stderr: ${data.toString().trim()}`);
    });

    proc.on("close", async (code) => {
      console.log(`[Tunnel] Playit process for ${serverId} exited (code ${code}).`);
      runningTunnels.delete(serverId);

      if (!intentionalStops.has(serverId)) {
        // The user was told the tunnel made the server reachable — a silent
        // death must be at least as loud as a game-server crash.
        await reportTunnelCrash(serverId, `exit code ${code}`);
      }
      intentionalStops.delete(serverId);
    });

    // ---- Phase 3: mirror the tunnel state for as long as the daemon lives ----
    await mirrorTunnelState({
      serverId, port, secret, api,
      cancelled,
      stillAlive: () => runningTunnels.has(serverId),
      onDaemonGone: () => {}, // the close handler owns crash reporting locally
    });
  } finally {
    startingTunnels.delete(serverId);
    lifecycleCancelled.delete(serverId);
  }
}

/**
 * The AGENT-server lifecycle: same claim handshake and the same rundata
 * mirror, but the daemon itself runs on the node (dispatched via
 * TUNNEL_START with the exchanged secret) and its liveness arrives through
 * the node's heartbeat (`tunnelsAlive`). The dashboard's copy of the secret
 * authenticates the rundata polling; the node keeps its own for the daemon.
 */
async function runAgentTunnelLifecycle(serverId: string, port: number): Promise<void> {
  const api = new PlayitApi();
  const cancelled = () => lifecycleCancelled.has(serverId);
  try {
    let secret = readPlayitSecret(serverId);
    if (!secret) {
      secret = await claimServerTunnel(serverId, api, cancelled);
      if (!secret || cancelled()) return;
    }

    // Dispatch the daemon. Idempotent node-side: the agent replaces any
    // daemon it already runs for this server.
    const node = await resolveUsableNode(serverId);
    const release = playitReleaseFor(node.platform || "linux", node.arch || "x64");
    if (!release) {
      throw new Error(`The node's platform (${node.platform || "?"}/${node.arch || "?"}) has no playit build.`);
    }
    const { id } = await enqueueCommand(node.id, serverId, "TUNNEL_START", {
      kind: "TUNNEL_START",
      binaryUrl: release.url,
      secret,
    } satisfies CommandPayload);
    const outcome = await awaitCommandResult(id, 5 * 60_000);
    if (cancelled()) return;
    if (!outcome.ok) {
      throw new Error(outcome.error || "The node failed to start the tunnel daemon.");
    }
    let daemonPid: number | null = null;
    try { daemonPid = JSON.parse(outcome.output ?? "{}").pid ?? null; } catch { /* no pid */ }
    await prisma.server.update({ where: { id: serverId }, data: { tunnelPid: daemonPid } }).catch(() => {});

    // Liveness arrives via the heartbeat; allow a startup grace for the next
    // sync (5s cadence) to report the fresh daemon.
    const startedAt = Date.now();
    const alive = () =>
      isTunnelAlive(serverId) || Date.now() - startedAt < 90_000;
    let reportedAlive = false;

    await mirrorTunnelState({
      serverId, port, secret, api,
      cancelled,
      stillAlive: () => {
        if (isTunnelAlive(serverId)) { reportedAlive = true; return true; }
        // Dead only once the heartbeat had a real chance to report alive.
        return !reportedAlive && Date.now() - startedAt < 90_000;
      },
      onDaemonGone: () => reportTunnelCrash(serverId, "the node stopped reporting its daemon"),
    });
  } finally {
    startingTunnels.delete(serverId);
    lifecycleCancelled.delete(serverId);
  }
}

async function notify(serverId: string, title: string, body: string): Promise<void> {
  try {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return;
    const { sendNotification } = await import("./notifications");
    await sendNotification(server.userId, title, body);
  } catch (err) {
    console.error("[Tunnel] Failed to send notification:", err);
  }
}

export async function stopTunnel(serverId: string): Promise<void> {
  // Cancels the claim/rundata loops on their next tick even when no agent
  // process exists yet (user toggles off while the claim is pending).
  lifecycleCancelled.add(serverId);
  agentAliveTunnels.delete(serverId);
  // DB state is cleared here (not only in the close handler) so a stalled
  // child can't leave a tunnelUrl that connectivity checks would trust.
  const clearDb = () => prisma.server.update({
    where: { id: serverId },
    data: { tunnelUrl: null, tunnelClaimUrl: null, tunnelPid: null }
  }).catch(() => {});

  const local = runningTunnels.get(serverId);
  if (!local) {
    // A node daemon may still exist even though this process never spawned
    // one — tell the node to stop it (best-effort: the node may be offline,
    // and the next start re-claims/re-dispatches anyway).
    try {
      const row = await prisma.server.findUnique({
        where: { id: serverId },
        select: { runnerType: true },
      });
      if (row?.runnerType === "AGENT") {
        const node = await resolveUsableNode(serverId).catch(() => null);
        if (node) {
          await enqueueCommand(node.id, serverId, "TUNNEL_STOP", { kind: "TUNNEL_STOP" }).catch(() => {});
        }
      }
    } catch { /* best-effort */ }
    await clearDb();
    return;
  }

  intentionalStops.add(serverId);
  const exited = new Promise<void>((resolve) => local.once("close", () => resolve()));
  local.kill("SIGTERM");
  const timeout = setTimeout(() => {
    try { local.kill("SIGKILL"); } catch (_) {}
  }, 3000);
  await exited.finally(() => clearTimeout(timeout));
  runningTunnels.delete(serverId);
  await clearDb();
}

export async function stopAllTunnels(): Promise<void> {
  await Promise.all(Array.from(runningTunnels.keys()).map((id) => stopTunnel(id)));
}

/**
 * Boot-time reconciliation: after an app crash or force-quit the DB still
 * claims tunnels that no longer exist, and playit agents orphaned by the dead
 * process may still be running. Kill what we can by recorded pid, then reset
 * the stale columns — "active" must never outlive the process that ran it.
 * Per-server secrets persist on disk, so the next start skips the claim.
 *
 * AGENT rows are special: their tunnelPid belongs to the NODE — killing it
 * from this machine would signal a random local process. Node daemons are
 * re-dispatched (TUNNEL_START is idempotent) or stopped by enablement state.
 */
export async function reconcileTunnelsOnBoot(): Promise<void> {
  try {
    const servers = await prisma.server.findMany({
      where: { OR: [{ tunnelPid: { not: null } }, { tunnelUrl: { not: null } }, { tunnelClaimUrl: { not: null } }] },
      select: { id: true, tunnelPid: true, runnerType: true, tunnelEnabled: true },
    });

    for (const s of servers) {
      if (s.runnerType === "AGENT") {
        // Never signal the node's pids from this machine. Disabled tunnels
        // get a best-effort TUNNEL_STOP; enabled ones are re-dispatched by
        // the resume loop below (startTunnel is idempotent node-side).
        if (!s.tunnelEnabled) {
          try {
            const node = await resolveUsableNode(s.id).catch(() => null);
            if (node) {
              await enqueueCommand(node.id, s.id, "TUNNEL_STOP", { kind: "TUNNEL_STOP" }).catch(() => {});
            }
          } catch { /* node offline — columns are cleared either way */ }
        }
        continue;
      }
      if (s.tunnelPid == null) continue;
      try {
        process.kill(s.tunnelPid, "SIGTERM");
        console.log(`[Tunnel] Killed orphaned playit agent (pid ${s.tunnelPid}) for server ${s.id}.`);
      } catch (err: any) {
        // ESRCH = already gone; anything else is worth a log but not a failure.
        if (err.code !== "ESRCH") console.error(`[Tunnel] Could not kill orphan pid ${s.tunnelPid}:`, err.message);
      }
    }
    await prisma.server.updateMany({
      where: { OR: [{ tunnelUrl: { not: null } }, { tunnelClaimUrl: { not: null } }, { tunnelPid: { not: null } }] },
      data: { tunnelUrl: null, tunnelClaimUrl: null, tunnelPid: null },
    });

    // Resume mirroring for enabled node tunnels (the daemon survived on the
    // node; only this process's mirror loop died with the old process).
    const agentServers = await prisma.server.findMany({
      where: { runnerType: "AGENT", tunnelEnabled: true },
      select: { id: true, port: true },
    });
    for (const s of agentServers) {
      console.log(`[Tunnel] Resuming node tunnel mirror for ${s.id}.`);
      await startTunnel(s.id, s.port).catch(() => {});
    }
  } catch (err) {
    console.error("[Tunnel] Boot reconciliation failed:", err);
  }
}
