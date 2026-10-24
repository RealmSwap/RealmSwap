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

/** True when a playit agent process for this server is alive in THIS process.
 *  DB `tunnelUrl` alone is not proof of life (it can go stale after a crash),
 *  so callers in the API process use this for honest status. */
export function isTunnelAlive(serverId: string): boolean {
  return runningTunnels.has(serverId);
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

  const platform = os.platform();
  const arch = os.arch();

  let downloadUrl = "";
  let binName = "";

  if (platform === "win32" && (arch === "x64" || arch === "arm64")) {
    downloadUrl = "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64.exe";
    binName = "playit.exe";
  } else if (platform === "linux" && arch === "x64") {
    downloadUrl = "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64";
    binName = "playit";
  } else {
    // No macOS build is published on GitHub releases (checked against every
    // release object of playit-cloud/playit-agent) — refuse instead of
    // downloading an error page and trusting it as a binary.
    throw new Error(`Unsupported OS/Arch for Playit auto-tunneling: ${platform}/${arch}`);
  }

  const binPath = path.join(BIN_DIR, binName);

  if (fs.existsSync(binPath)) {
    return binPath;
  }

  console.log(`[Tunnel] Downloading playit binary from ${downloadUrl}...`);

  // Download to a .part file and rename into place, checking every response
  // status: piping an error page into binPath and chmod-ing it would plant a
  // corrupt binary that existsSync() then trusts forever.
  const partPath = `${binPath}.part`;
  try {
    let response = await httpsGet(downloadUrl, DOWNLOAD_TIMEOUT_MS);
    if (response.statusCode === 301 || response.statusCode === 302) {
      const location = response.headers.location;
      if (!location) throw new Error("Download redirect had no target location.");
      response = await httpsGet(location, DOWNLOAD_TIMEOUT_MS);
    }
    if (response.statusCode !== 200) {
      throw new Error(`Download failed with HTTP ${response.statusCode} for ${downloadUrl}.`);
    }

    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(partPath);
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
      response.on("error", reject);
    });

    if (platform !== "win32") fs.chmodSync(partPath, "755");
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
  // Tunnels proxy a port on the machine running this dashboard — meaningless
  // (and wrong) for a server whose game container lives on a remote node.
  const { prisma } = await import("@/lib/db");
  const row = await prisma.server.findUnique({ where: { id: serverId }, select: { runnerType: true } }).catch(() => null);
  if (row?.runnerType === "AGENT") {
    throw new Error("Tunnels are not supported for remote-node servers yet — port-forward the node's ports instead.");
  }
  if (runningTunnels.has(serverId) || startingTunnels.has(serverId)) {
    return { ok: true };
  }
  startingTunnels.add(serverId);
  lifecycleCancelled.delete(serverId);
  intentionalStops.delete(serverId);
  try {
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

async function runTunnelLifecycle(serverId: string, port: number, binPath: string): Promise<void> {
  const api = new PlayitApi();
  const cancelled = () => lifecycleCancelled.has(serverId);
  let secret = readPlayitSecret(serverId);

  try {
    // ---- Phase 1: claim (only when no agent secret exists yet) ----
    if (!secret) {
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
          return;
        }
        await sleep(CLAIM_POLL_MS);
      }
      if (cancelled() || !accepted) return;

      let exchanged = false;
      while (!cancelled()) {
        try {
          secret = await api.claimExchange(code);
          exchanged = true;
          break;
        } catch (err) {
          if (isPlayitFailure(err, "UserRejected")) break;
          // NotAccepted right after approval is the normal race — keep polling.
          await sleep(CLAIM_POLL_MS);
        }
      }
      if (cancelled() || !exchanged || !secret) return;

      writePlayitSecret(serverId, secret);
      await prisma.server.update({ where: { id: serverId }, data: { tunnelClaimUrl: null } }).catch(() => {});
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
      await prisma.server.update({
        where: { id: serverId },
        data: { tunnelUrl: null, tunnelClaimUrl: null, tunnelPid: null },
      }).catch(() => {});

      if (!intentionalStops.has(serverId)) {
        // The user was told the tunnel made the server reachable — a silent
        // death must be at least as loud as a game-server crash.
        try {
          const server = await prisma.server.findUnique({ where: { id: serverId } });
          if (server) {
            const { sendNotification } = await import("./notifications");
            sendNotification(server.userId, "🕳️ Tunnel Disconnected", `The playit tunnel for '${server.name}' stopped unexpectedly (exit code ${code}). Friends can't join through it until you re-enable it from Join Info.`);
            await prisma.activityLog.create({
              data: {
                userId: server.userId,
                serverId,
                action: "TUNNEL_CRASH",
                details: `Playit tunnel for '${server.name}' exited unexpectedly (code ${code}).`,
              },
            });
          }
        } catch (err) {
          console.error("[Tunnel] Failed to record tunnel crash:", err);
        }
      }
      intentionalStops.delete(serverId);
    });

    // ---- Phase 3: mirror the tunnel state for as long as the agent lives ----
    // The daemon learns tunnels from the playit API; this loop mirrors the
    // same source of truth into the DB: creates the binding for our game port
    // once, writes the assigned address, and clears it again if playit stops
    // forwarding. No deadline: a slow allocation must still land.
    let createAttempted = false;
    let lastAddress: string | null = null;
    let lastDisabledNotice: string | null = null;

    while (!cancelled() && !exited) {
      await sleep(RUNDATA_POLL_MS);
      if (cancelled() || exited) break;

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
  const proc = runningTunnels.get(serverId);
  // DB state is cleared here (not only in the close handler) so a stalled
  // child can't leave a tunnelUrl that connectivity checks would trust.
  const clearDb = () => prisma.server.update({
    where: { id: serverId },
    data: { tunnelUrl: null, tunnelClaimUrl: null, tunnelPid: null }
  }).catch(() => {});

  if (!proc) {
    await clearDb();
    return;
  }

  intentionalStops.add(serverId);
  const exited = new Promise<void>((resolve) => proc.once("close", () => resolve()));
  proc.kill("SIGTERM");
  const timeout = setTimeout(() => {
    try { proc.kill("SIGKILL"); } catch (_) {}
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
 */
export async function reconcileTunnelsOnBoot(): Promise<void> {
  try {
    const servers = await prisma.server.findMany({
      where: { tunnelPid: { not: null } },
      select: { id: true, tunnelPid: true },
    });
    for (const s of servers) {
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
  } catch (err) {
    console.error("[Tunnel] Boot reconciliation failed:", err);
  }
}
