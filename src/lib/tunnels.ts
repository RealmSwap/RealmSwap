import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import { spawn, ChildProcess } from "child_process";
import { dataRoot } from "./appPaths";
import { prisma } from "./db";

const BIN_DIR = path.join(dataRoot(), "bin");
const DOWNLOAD_TIMEOUT_MS = 60_000;

// Map of running tunnels (serverId -> ChildProcess)
const runningTunnels = new Map<string, ChildProcess>();
// Spawns in flight (download + claim) — guards the double-spawn race between
// e.g. the start route and the settings toggle.
const startingTunnels = new Set<string>();
// ServerIds whose stop was requested — distinguishes an expected exit from a crash.
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

  if (platform === "win32") {
    downloadUrl = "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64.exe";
    binName = "playit.exe";
  } else if (platform === "linux" && arch === "x64") {
    downloadUrl = "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64";
    binName = "playit";
  } else if (platform === "darwin" && arch === "arm64") {
    downloadUrl = "https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-darwin-aarch64";
    binName = "playit";
  } else {
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

/**
 * Spawn the playit agent for a server. The agent does not bind the game port
 * by itself: the user must claim it (claim link stored on the server row and
 * shown in Join Info) and configure the port on the playit dashboard, so
 * callers must treat "started" as "agent running", NOT "tunnel forwarding".
 */
export async function startTunnel(serverId: string, port: number): Promise<TunnelStartResult> {
  if (runningTunnels.has(serverId) || startingTunnels.has(serverId)) {
    return { ok: true };
  }
  startingTunnels.add(serverId);
  intentionalStops.delete(serverId);
  try {
    const binPath = await downloadPlayitBinary();

    const playitProcess = spawn(binPath, [], {
      cwd: BIN_DIR,
      env: process.env
    });

    runningTunnels.set(serverId, playitProcess);
    await prisma.server.update({
      where: { id: serverId },
      data: { tunnelPid: playitProcess.pid ?? null }
    }).catch(() => {});

    let sawTunnelUrl = false;
    let sawClaimUrl = false;

    playitProcess.stdout.on("data", async (data) => {
      const output = data.toString();

      // Assigned tunnel address (e.g. xxx.auto.playit.gg) — write once.
      const match = output.match(/([a-z0-9-]+\.auto\.playit\.gg(?::\d+)?)/);
      if (match && !sawTunnelUrl) {
        sawTunnelUrl = true;
        const tunnelUrl = match[1];
        await prisma.server.update({
          where: { id: serverId },
          data: { tunnelUrl }
        }).catch(() => {});
      }

      // Claim link for an unclaimed agent — surfaced to the user via Join Info.
      const claimMatch = output.match(/(https:\/\/playit\.gg\/claim\/[a-zA-Z0-9]+)/);
      if (claimMatch && !sawClaimUrl) {
        sawClaimUrl = true;
        const claimUrl = claimMatch[1];
        console.log(`[Tunnel] Server ${serverId} claim link: ${claimUrl}`);
        await prisma.server.update({
          where: { id: serverId },
          data: { tunnelClaimUrl: claimUrl }
        }).catch(() => {});
      }
    });

    playitProcess.stderr.on("data", (data) => {
      console.error(`[Tunnel] ${serverId} stderr: ${data.toString().trim()}`);
    });

    playitProcess.on("close", async (code) => {
      console.log(`[Tunnel] Playit process for ${serverId} exited (code ${code}).`);
      runningTunnels.delete(serverId);
      await prisma.server.update({
        where: { id: serverId },
        data: { tunnelUrl: null, tunnelClaimUrl: null, tunnelPid: null }
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

    return { ok: true };
  } catch (err: any) {
    console.error("[Tunnel] Failed to start tunnel:", err);
    return { ok: false, error: err.message || String(err) };
  } finally {
    startingTunnels.delete(serverId);
  }
}

export async function stopTunnel(serverId: string): Promise<void> {
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
