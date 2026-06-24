import { spawn, exec } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import net from "net";
import { prisma } from "./db";
import { mapPort, unmapPort, getPublicIP } from "./upnp";
import { startMonitoring, stopMonitoring, clearStatsHistory } from "./processMonitor";
import { parseSpec } from "./definitions/serialize";
import { buildContext } from "./definitions/context";
import { planInstall, planConfigFiles, planLaunch, planPorts, resolveCommand } from "./definitions/plan";
import { writeStrategyConfig } from "./definitions/strategies";
import type { GameDefinitionSpec } from "./definitions/types";
import { setProgress, clearProgress, parseSteamProgress, computePercent, isMissingConfigError } from "./downloadProgress";
import { dataRoot } from "./appPaths";
import { appendLog, clearLogs } from "./logStreamer";

// Global process map to persist running processes across Next.js dev server hot-reloads
const globalForRunner = globalThis as unknown as {
  localProcesses: Map<string, any> | undefined;
  intentionalStops: Set<string> | undefined;
  crashCounters: Map<string, { count: number; windowStart: number }> | undefined;
};

if (!globalForRunner.localProcesses) {
  globalForRunner.localProcesses = new Map();
}
if (!globalForRunner.intentionalStops) {
  globalForRunner.intentionalStops = new Set();
}
if (!globalForRunner.crashCounters) {
  globalForRunner.crashCounters = new Map();
}

export const localProcesses = globalForRunner.localProcesses;
const intentionalStops = globalForRunner.intentionalStops;
const crashCounters = globalForRunner.crashCounters;

const CRASH_MAX_RETRIES = 3;
const CRASH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// SteamCMD info mapping for each game (kept for backwards compat; no longer used by the runner)
export function getGameSteamInfo(game: string): { appId: string; installSubDir: string; checkFile: string } | null {
  switch (game.toUpperCase()) {
    case "VALHEIM": return { appId: "896660", installSubDir: "valheim-server", checkFile: "valheim_server.exe" };
    case "ENSHROUDED": return { appId: "2278520", installSubDir: "enshrouded-server", checkFile: "enshrouded_server.exe" };
    case "ZOMBOID": return { appId: "380870", installSubDir: "zomboid-server", checkFile: "StartServer64.bat" };
    case "ARK": return { appId: "376030", installSubDir: "ark-server", checkFile: "ShooterGame/Binaries/Win64/ShooterGameServer.exe" };
    case "TERRARIA": return { appId: "282440", installSubDir: "terraria-server", checkFile: "TerrariaServer.exe" };
    case "PALWORLD": return { appId: "2394010", installSubDir: "palworld-server", checkFile: "PalServer.exe" };
    case "RUST": return { appId: "258550", installSubDir: "rust-server", checkFile: "RustDedicated.exe" };
    default: return null;
  }
}

const STEAMCMD_ZIP_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

// Check if Java is installed (Required only for Minecraft)
export function checkJavaInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    exec("java -version", (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// Ensure local directories exist
function getLocalServerDir(serverId: string, sub?: string): string {
  const dir = sub
    ? path.join(dataRoot(), "local-servers", serverId, sub)
    : path.join(dataRoot(), "local-servers", serverId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Download utility. onProgress receives a 0..100 percent, or null when the
// server does not send a Content-Length header (indeterminate).
function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number | null) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        return;
      }
      const total = parseInt(response.headers["content-length"] || "", 10);
      let received = 0;
      let lastEmit = 0;
      if (onProgress) onProgress(computePercent(received, total));
      response.on("data", (chunk) => {
        received += chunk.length;
        const now = Date.now();
        // Throttle to ~4x/sec to avoid spamming the store on every chunk.
        if (onProgress && now - lastEmit >= 250) {
          lastEmit = now;
          onProgress(computePercent(received, total));
        }
      });
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        if (onProgress) onProgress(computePercent(received, total));
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {}); // Delete partial file
      reject(err);
    });
  });
}

// Setup SteamCMD on demand
export function setupSteamCMD(onLog: (msg: string) => void): Promise<string> {
  const steamcmdDir = path.join(dataRoot(), "steamcmd");
  const exePath = path.join(steamcmdDir, "steamcmd.exe");
  const zipPath = path.join(dataRoot(), "steamcmd.zip");

  if (fs.existsSync(exePath)) {
    return Promise.resolve(exePath);
  }

  return new Promise(async (resolve, reject) => {
    try {
      onLog("SteamCMD not found. Downloading steamcmd.zip...");
      if (!fs.existsSync(steamcmdDir)) {
        fs.mkdirSync(steamcmdDir, { recursive: true });
      }

      await downloadFile(STEAMCMD_ZIP_URL, zipPath);
      onLog("Extracting steamcmd.zip using Windows PowerShell...");

      const extractCmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${steamcmdDir}' -Force"`;
      exec(extractCmd, (err) => {
        try { fs.unlinkSync(zipPath); } catch (_) {}

        if (err) {
          reject(new Error(`Failed to extract SteamCMD: ${err.message}`));
        } else {
          onLog("SteamCMD successfully configured!");
          resolve(exePath);
        }
      });
    } catch (err: any) {
      reject(err);
    }
  });
}

// Helper to query free disk space on Windows in GB
function getFreeDiskSpaceGB(dir: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const drive = path.parse(path.resolve(dir)).root.substring(0, 2); // e.g. "C:"
      exec(`powershell -Command "[math]::round(((Get-PSDrive ${drive[0]}).Free / 1GB), 2)"`, (err, stdout) => {
        if (err || !stdout) {
          resolve(-1);
          return;
        }
        const gbs = parseFloat(stdout.trim());
        if (isNaN(gbs)) {
          resolve(-1);
        } else {
          resolve(gbs);
        }
      });
    } catch (e) {
      resolve(-1);
    }
  });
}

// Bootstraps SteamCMD. When first run, SteamCMD updates itself and exits,
// which returns a non-zero code. We retry up to 3 times until it exits with code 0 (fully updated).
export function ensureSteamCmdUpdated(steamcmdExe: string, onLog: (msg: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 3;

    const runUpdateCheck = () => {
      attempts++;
      onLog(`SteamCMD self-update check (Attempt ${attempts}/${maxAttempts})...`);

      const child = spawn(steamcmdExe, ["+quit"]);

      child.stdout.on("data", (data) => {
        const line = data.toString().trim();
        if (line) {
          onLog(`[SteamCMD Bootstrap] ${line.replace(/[\r\n]+/g, " ")}`);
        }
      });

      child.stderr.on("data", (data) => {
        const line = data.toString().trim();
        if (line) {
          onLog(`[SteamCMD Bootstrap Error] ${line.replace(/[\r\n]+/g, " ")}`);
        }
      });

      child.on("close", (code) => {
        if (code === 0) {
          onLog("SteamCMD is fully updated and ready.");
          resolve();
        } else if (attempts < maxAttempts) {
          onLog(`SteamCMD updated and restarted itself (Exit Code: ${code}). Retrying check...`);
          // Wait 2s to let files write before relaunching
          setTimeout(runUpdateCheck, 2000);
        } else {
          reject(new Error(`SteamCMD failed to bootstrap after ${maxAttempts} attempts. Exit code: ${code}. Check the logs for error details.`));
        }
      });
    };

    runUpdateCheck();
  });
}

// Download a Steam game server via SteamCMD by App ID
function installSteamCmdApp(
  serverId: string,
  appId: string,
  appName: string,
  installDir: string,
  checkFile: string,
  requiredGB: number,
  onLog: (msg: string) => void,
  onProgress?: (p: { percent: number | null; label: string }) => void
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const exePath = path.join(installDir, checkFile);
      if (fs.existsSync(exePath)) {
        resolve();
        return;
      }

      // Check free disk space before any SteamCMD action
      const freeSpace = await getFreeDiskSpaceGB(installDir);
      if (freeSpace !== -1) {
        // SteamCMD itself requires at least 250MB (0.25GB) free space to download and bootstrap
        const minSteamCmdGB = 0.25;
        const totalRequiredGB = Math.max(requiredGB, minSteamCmdGB);

        onLog(`[Disk Check] Available space: ${freeSpace.toFixed(2)} GB, Required: ${totalRequiredGB} GB`);
        if (freeSpace < totalRequiredGB) {
          reject(new Error(`Insufficient disk space on target drive. You have ${freeSpace.toFixed(2)} GB free, but installing/updating SteamCMD and ${appName} requires at least ${totalRequiredGB} GB.`));
          return;
        }
      }

      onProgress?.({ percent: null, label: "Setting up SteamCMD…" });
      const steamcmdExe = await setupSteamCMD(onLog);
      onProgress?.({ percent: null, label: "Updating SteamCMD…" });
      await ensureSteamCmdUpdated(steamcmdExe, onLog);

      onLog(`Starting ${appName} installation via SteamCMD (App ID ${appId})...`);
      onLog("This is a background download and may take several minutes depending on connection speeds. Please wait...");

      const cleanInstallDir = installDir.replace(/\\/g, "/");
      const MAX_ATTEMPTS = 3;

      // Runs one SteamCMD app_update and resolves with the exit code plus the
      // last captured error line. Never rejects — the caller decides on retry.
      //
      // +app_info_update 1 refreshes the app-metadata cache before the install.
      // On a freshly bootstrapped SteamCMD the cache is still empty, so the first
      // app_update can fail with "Missing configuration" (exit code 8); the next
      // attempt warms the cache and succeeds, so we retry that specific failure.
      const runAppUpdate = (): Promise<{ code: number | null; detail: string }> =>
        new Promise((res) => {
          const child = spawn(steamcmdExe, [
            "+force_install_dir", cleanInstallDir,
            "+login", "anonymous",
            "+app_info_update", "1",
            "+app_update", appId,
            "validate",
            "+quit"
          ]);

          // Capture SteamCMD's real error so failures report the cause, not just an exit code.
          let steamErrorDetail = "";
          child.stdout.on("data", (data) => {
            const line = data.toString().trim();
            if (line) {
              const cleanLine = line.replace(/[\r\n]+/g, " ");
              const pct = parseSteamProgress(cleanLine);
              if (pct !== null) {
                onProgress?.({ percent: pct, label: `Downloading ${appName} ${Math.round(pct)}%` });
              }
              if (/ERROR!|Failed to install|No subscription|Invalid Password|Disk write failure/i.test(cleanLine)) {
                steamErrorDetail = cleanLine;
                onLog(`[SteamCMD Error] ${cleanLine}`);
              } else if (cleanLine.includes("progress") || cleanLine.includes("Downloading") || cleanLine.includes("Update state")) {
                onLog(`[SteamCMD Status] ${cleanLine}`);
              }
            }
          });

          child.stderr.on("data", (data) => {
            const line = data.toString().trim();
            if (line) {
              steamErrorDetail = line.replace(/[\r\n]+/g, " ");
              onLog(`[SteamCMD warning] ${line}`);
            }
          });

          child.on("close", (code) => res({ code, detail: steamErrorDetail }));
        });

      let lastCode: number | null = null;
      let lastDetail = "";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const { code, detail } = await runAppUpdate();
        if (code === 0 || fs.existsSync(exePath)) {
          onLog(`${appName} download completed!`);
          resolve();
          return;
        }
        lastCode = code;
        lastDetail = detail;
        if (isMissingConfigError(code, detail) && attempt < MAX_ATTEMPTS) {
          onProgress?.({ percent: null, label: "Preparing SteamCMD…" });
          onLog(`[SteamCMD] App metadata cache was cold ("Missing configuration", exit ${code}). Retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        break;
      }

      const detail = lastDetail ? ` - ${lastDetail}` : " (see steamcmd/logs/console_log.txt for details)";
      reject(new Error(`SteamCMD App ${appId} download process exited with code ${lastCode}${detail}`));
    } catch (err: any) {
      reject(err);
    }
  });
}

// Run a custom install shell script
function runShellScript(script: string, cwd: string, onLog: (m: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    onLog("[Custom Script] Executing install script...");
    const child = spawn("cmd.exe", ["/c", script], { cwd });
    child.stdout.on("data", (d) => onLog(`[Custom Script] ${d.toString().trim()}`));
    child.stderr.on("data", (d) => onLog(`[Custom Script] ${d.toString().trim()}`));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Custom install script exited with code ${code}`))));
  });
}

// Resolve a game definition from the database (by definitionId or built-in slug fallback)
async function resolveDefinition(server: { definitionId: string | null; game: string }): Promise<{ spec: GameDefinitionSpec; installMethod: string; requiresJava: boolean }> {
  let record = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  if (!record) throw new Error(`No game definition found for server (game=${server.game}).`);
  const spec = parseSpec(record.spec);
  return { spec, installMethod: record.installMethod, requiresJava: !!spec.requiresJava };
}

// Readiness check logic
function waitForReadiness(
  serverId: string,
  child: import("child_process").ChildProcessWithoutNullStreams,
  launch: import("./definitions/plan").LaunchPlan,
  tcpPorts: number[],
  logWriter: (msg: string) => void
) {
  let isReady = false;
  let timeoutId: NodeJS.Timeout;
  let intervalId: NodeJS.Timeout;

  const markReady = (reason: string) => {
    if (isReady) return;
    isReady = true;
    clearTimeout(timeoutId);
    clearInterval(intervalId);
    logWriter(`[Readiness Check] Server is ready (${reason})`);
    
    prisma.server.update({
      where: { id: serverId },
      data: { status: "RUNNING" },
    }).catch(e => console.error("Error updating status to RUNNING:", e));
  };

  // 1. Stdout listener
  const readyPattern = launch.readyPattern ? new RegExp(launch.readyPattern, "i") : null;
  if (readyPattern) {
    const onData = (chunk: Buffer) => {
      if (isReady) return;
      if (readyPattern.test(chunk.toString())) {
        markReady(`Matched log pattern: ${launch.readyPattern}`);
      }
    };
    child.stdout.on("data", onData);
  }

  // 2. Port polling
  if (tcpPorts.length > 0) {
    intervalId = setInterval(() => {
      if (isReady) return;
      const portToCheck = tcpPorts[0]; // Check first TCP port
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.on("connect", () => {
        socket.destroy();
        markReady(`TCP Port ${portToCheck} is accepting connections`);
      }).on("error", () => {
        socket.destroy();
      }).on("timeout", () => {
        socket.destroy();
      });
      socket.connect(portToCheck, "127.0.0.1");
    }, 5000);
  }

  // 3. Fallback timeout (5 minutes)
  timeoutId = setTimeout(() => {
    if (isReady) return;
    markReady("5-minute fallback timeout reached");
  }, 5 * 60 * 1000);
}

// Main: Start a local game server
export async function startLocalServer(serverId: string, game: string, ramAllocation: number): Promise<any> {
  const baseDir = getLocalServerDir(serverId);
  clearLogs(serverId);

  // If server is already running, do nothing
  if (localProcesses.has(serverId)) {
    return;
  }

  const logWriter = (msg: string) => appendLog(serverId, msg);

  // Fetch full server record from database to read custom passwords and UPnP configs
  const server = await prisma.server.findUnique({
    where: { id: serverId }
  });

  if (!server) {
    throw new Error("Server record not found in database.");
  }

  // UPnP & Public WAN IP Setup
  let currentIp = "127.0.0.1";

  // 1. Try to query public WAN IP address so they always get a shareable address
  try {
    const publicIp = await getPublicIP();
    if (publicIp) {
      currentIp = publicIp;
      logWriter(`[IP Resolver] Resolved public WAN Address: ${publicIp}`);
    }
  } catch (ipErr: any) {
    logWriter(`[IP Resolver Warning] Could not resolve public WAN IP address: ${ipErr.message}`);
  }

  // Resolve game definition (from DB by definitionId, or built-in by slug)
  const { spec, installMethod, requiresJava } = await resolveDefinition(server);
  const ctx = buildContext({
    name: server.name,
    password: server.password,
    port: server.port,
    ram: ramAllocation,
    paramValuesJson: server.paramValues,
    spec,
  });

  // 2. Map router ports using UPnP if requested or enabled by default
  if (server.enableUpnp || server.runnerType === "LOCAL") {
    logWriter("[UPnP] Requesting router port forwarding rules...");
    try {
      for (const pm of planPorts(spec, ctx)) {
        await mapPort(pm.port, pm.protocol, `RealmSwap - ${server.name}`);
      }
      logWriter("[UPnP] Success! Router port forward mapping completed successfully.");
    } catch (e: any) {
      logWriter(`[UPnP Warning] Failed to configure router port maps: ${e.message}`);
      if (currentIp !== "127.0.0.1") {
        logWriter(`[UPnP Note] You can still share your public IP (${currentIp}) with friends, but you may need to configure port forwarding manually on your router.`);
      }
    }
  }

  // 3. Install if needed
  if (requiresJava) {
    if (!(await checkJavaInstalled())) {
      throw new Error("Java Runtime Environment (JRE) was not found on your system. Please install Java (JDK/JRE 17+) to run Minecraft servers locally.");
    }
  }

  const installPlan = planInstall(spec, installMethod as any);
  const installDir = installPlan.installSubDir ? getLocalServerDir(serverId, installPlan.installSubDir) : baseDir;

  if (installPlan.method === "STEAMCMD") {
    const exePath = path.join(installDir, installPlan.checkFile!);
    if (!fs.existsSync(exePath)) {
      try {
        await prisma.server.update({ where: { id: serverId }, data: { status: "STARTING" } });
        setProgress(serverId, { phase: "steam", percent: null, label: "Setting up SteamCMD…" });
        await installSteamCmdApp(
          serverId,
          installPlan.appId!,
          server.name,
          installDir,
          installPlan.checkFile!,
          installPlan.requiredDiskGB ?? 3,
          logWriter,
          (p) => setProgress(serverId, { phase: "steam", percent: p.percent, label: p.label })
        );
      } catch (err: any) {
        clearProgress(serverId);
        logWriter(`Installation failed: ${err.message}`);
        throw new Error(`Server install failed: ${err.message}`);
      }
    }
  } else if (installPlan.method === "DOWNLOAD") {
    const target = path.join(installDir, installPlan.fileName!);
    if (!fs.existsSync(path.join(installDir, installPlan.checkFile!))) {
      try {
        await prisma.server.update({ where: { id: serverId }, data: { status: "STARTING" } });
        logWriter("Server binary not found. Downloading...");
        setProgress(serverId, { phase: "download", percent: null, label: `Downloading ${server.name}…` });
        await downloadFile(installPlan.url!, target, (pct) =>
          setProgress(serverId, {
            phase: "download",
            percent: pct,
            label: pct === null ? `Downloading ${server.name}…` : `Downloading ${server.name} ${Math.round(pct)}%`,
          })
        );
        logWriter("Download completed successfully.");
        // Unzip if needed (e.g. zip archives)
        if (installPlan.unzip) {
          setProgress(serverId, { phase: "extract", percent: null, label: "Extracting…" });
          logWriter("Extracting archive using Windows PowerShell...");
          await new Promise<void>((resolve, reject) => {
            const extractCmd = `powershell -Command "Expand-Archive -Path '${target}' -DestinationPath '${installDir}' -Force"`;
            exec(extractCmd, (err) => {
              try { fs.unlinkSync(target); } catch (_) {}
              if (err) reject(new Error(`Failed to extract archive: ${err.message}`));
              else resolve();
            });
          });
          logWriter("Extraction complete.");
        }
      } catch (err: any) {
        clearProgress(serverId);
        logWriter(`Download failed: ${err.message}`);
        throw new Error(`Failed to download game server binaries: ${err.message}`);
      }
    }
  } else if (installPlan.method === "CUSTOM_SCRIPT") {
    setProgress(serverId, { phase: "script", percent: null, label: "Running install script…" });
    try {
      await runShellScript(installPlan.installScript!, installDir, logWriter);
    } catch (err) {
      clearProgress(serverId);
      throw err;
    }
  }

  // 4. Write config files
  for (const cf of planConfigFiles(spec, ctx)) {
    const full = path.join(installDir, cf.relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (cf.strategy === "template") {
      fs.writeFileSync(full, cf.content ?? "");
    } else {
      writeStrategyConfig({
        strategy: cf.strategy as "enshroudedJson" | "zomboidIniMerge",
        installDir,
        serverName: server.name,
        password: server.password || undefined,
      });
    }
  }

  // 5. Launch the server process
  const launch = planLaunch(spec, ctx);
  const cwd = launch.cwdSubDir ? getLocalServerDir(serverId, launch.cwdSubDir) : baseDir;

  // Create any directories required before launch (e.g. Terraria "worlds/")
  if (launch.preLaunchDirs?.length) {
    for (const d of launch.preLaunchDirs) {
      fs.mkdirSync(path.join(installDir, d), { recursive: true });
    }
  }

  let child;
  if (launch.launchScript && installMethod === "CUSTOM_SCRIPT") {
    child = spawn("cmd.exe", ["/c", launch.launchScript], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(launch.env || {}) },
    });
  } else {
    // Resolve the executable: PATH commands (java, cmd.exe) by name; all others relative to installDir
    const resolvedExe = resolveCommand(installDir, launch.executable, launch.executableOnPath);
    child = spawn(resolvedExe, launch.args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(launch.env || {}) },
    });
  }

  if (!child.pid) throw new Error("Failed to spawn server child process.");
  localProcesses.set(serverId, child);
  clearProgress(serverId);

  // 6. Capture all stdout and check for patterns
  child.stdout.on("data", (chunk) => {
    const s = chunk.toString();
    appendLog(serverId, s);

    if (launch.stdoutPatterns?.length) {
      for (const pat of launch.stdoutPatterns!) {
        const m = s.match(new RegExp(pat.regex, "i"));
        if (m && m[1] && pat.updateField === "ipAddress") {
          const value = pat.transform === "joinCode" ? `Join Code: ${m[1]}` : m[1];
          logWriter(`[PlayFab] Success! Server registered with join code: ${m[1]}`);
          prisma.server.update({
            where: { id: serverId },
            data: { ipAddress: value },
          }).catch((err) => console.error("Error updating join code in DB:", err));
        }
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    appendLog(serverId, chunk.toString());
  });

  await prisma.server.update({
    where: { id: serverId },
    data: {
      status: "STARTING",
      pid: child.pid,
      ipAddress: currentIp,
      cpuUsage: 0,
      memoryUsage: 0,
    },
  });

  startMonitoring(serverId, child.pid);

  // Wait for readiness
  const tcpPorts = planPorts(spec, ctx).filter(p => p.protocol === "TCP").map(p => p.port);
  waitForReadiness(serverId, child as any, launch, tcpPorts, logWriter);

  child.on("exit", (code, signal) => handleProcessExit(serverId, code, signal, baseDir));
}

// Clean up database on process exit — with crash detection & auto-restart
async function handleProcessExit(serverId: string, code: number | null, signal: string | null, baseDir: string) {
  localProcesses.delete(serverId);
  stopMonitoring(serverId);
  clearProgress(serverId);

  const wasIntentional = intentionalStops.has(serverId);
  intentionalStops.delete(serverId);

  const isCrash = !wasIntentional && code !== null && code !== 0;

  try {
    const serverRec = await prisma.server.findUnique({ where: { id: serverId } });
    if (!serverRec) return;

    if (isCrash) {
      // Check crash counter
      const now = Date.now();
      let counter = crashCounters.get(serverId);
      if (!counter || (now - counter.windowStart) > CRASH_WINDOW_MS) {
        counter = { count: 0, windowStart: now };
      }
      counter.count++;
      crashCounters.set(serverId, counter);

      appendLog(serverId, `[Crash Detection] Server crashed with exit code ${code} (Attempt ${counter.count}/${CRASH_MAX_RETRIES})`);

      await prisma.activityLog.create({
        data: {
          userId: serverRec.userId,
          action: "STOP_SERVER",
          details: `Server '${serverRec.name}' (${serverRec.game}) CRASHED (Code: ${code}). Auto-restart attempt ${counter.count}/${CRASH_MAX_RETRIES}.`,
        }
      });

      if (counter.count < CRASH_MAX_RETRIES) {
        appendLog(serverId, `[Crash Detection] Auto-restarting in 5 seconds...`);
        await prisma.server.update({
          where: { id: serverId },
          data: { status: "STARTING", pid: null, cpuUsage: 0, memoryUsage: 0 },
        });

        setTimeout(async () => {
          try {
            clearStatsHistory(serverId);
            await startLocalServer(serverId, serverRec.game, serverRec.ramAllocation);
          } catch (restartErr: any) {
            appendLog(serverId, `[Crash Detection] Auto-restart failed: ${restartErr.message}`);
            await prisma.server.update({
              where: { id: serverId },
              data: { status: "CRASHED", pid: null, cpuUsage: 0, memoryUsage: 0 },
            }).catch(() => {});
          }
        }, 5000);
        return;
      } else {
        appendLog(serverId, `[Crash Detection] Max retries (${CRASH_MAX_RETRIES}) exhausted. Marking server as CRASHED.`);
        await prisma.server.update({
          where: { id: serverId },
          data: { status: "CRASHED", pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 },
        });
        return;
      }
    }

    // Normal (intentional or clean) exit
    await prisma.server.update({
      where: { id: serverId },
      data: {
        status: "STOPPED",
        pid: null,
        ipAddress: "127.0.0.1",
        cpuUsage: 0,
        memoryUsage: 0
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: serverRec.userId,
        action: "STOP_SERVER",
        details: `Local server '${serverRec.name}' (${serverRec.game}) exited (Code: ${code}, Signal: ${signal}).`,
      }
    });
  } catch (e) {
    console.error("Error updating DB on local process exit:", e);
  }
  appendLog(serverId, `Process exited with code ${code} and signal ${signal}`);
}

// Main: Stop local game server gracefully
export async function stopLocalServer(serverId: string): Promise<void> {
  const child = localProcesses.get(serverId);
  const server = await prisma.server.findUnique({ where: { id: serverId } });

  // Mark as intentional stop so crash detection doesn't trigger
  intentionalStops.add(serverId);
  // Reset crash counter on intentional stop
  crashCounters.delete(serverId);

  // Resolve definition once; reuse for both UPnP and stdinStopCommand
  const resolvedDef = server ? await resolveDefinition(server).catch(() => null) : null;

  if (server && (server.enableUpnp || server.runnerType === "LOCAL")) {
    appendLog(serverId, "[UPnP] Releasing router port mappings...");
    try {
      if (!resolvedDef) throw new Error("No game definition found");
      const { spec } = resolvedDef;
      const ctx = buildContext({
        name: server.name,
        password: server.password,
        port: server.port,
        ram: server.ramAllocation,
        paramValuesJson: server.paramValues,
        spec,
      });
      for (const pm of planPorts(spec, ctx)) {
        await unmapPort(pm.port, pm.protocol);
      }
    } catch (e: any) {
      appendLog(serverId, `[UPnP Error] Failed to release port forwarding: ${e.message}`);
    }
  }

  if (child) {
    appendLog(serverId, "Termination request received. Terminating process tree...");

    // Use the spec's stdinStopCommand for graceful shutdown (e.g. Minecraft sends "stop\n")
    const { spec } = resolvedDef ?? { spec: null as any };
    if (child && spec?.launch?.stdinStopCommand) {
      try {
        child.stdin.write(spec.launch.stdinStopCommand);
      } catch {
        child.kill("SIGTERM");
      }
    } else if (child) {
      exec(`taskkill /F /T /PID ${child.pid}`, (err) => {
        if (err) child.kill("SIGKILL");
      });
    }

    const timeout = setTimeout(() => {
      if (localProcesses.has(serverId)) {
        appendLog(serverId, "Shutdown timed out. Force killing process...");
        child.kill("SIGKILL");
        // Force kill sub-processes on Windows
        exec(`taskkill /F /T /PID ${child.pid}`, () => {});
      }
    }, 7000);

    await new Promise<void>((resolve) => {
      child.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } else {
    await prisma.server.update({
      where: { id: serverId },
      data: {
        status: "STOPPED",
        pid: null,
        ipAddress: "127.0.0.1",
        cpuUsage: 0,
        memoryUsage: 0
      }
    });
  }
}

// Reads tail logs of local server
export function getLocalServerLogs(serverId: string): string {
  // Logic now handled by logStreamer
  return "";
}

// Update a game server via SteamCMD (re-runs app_update)
export async function updateGameServer(serverId: string): Promise<void> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) throw new Error("Server not found");

  const { spec, installMethod } = await resolveDefinition(server);
  if (installMethod !== "STEAMCMD") throw new Error(`Updates are only supported for SteamCMD games.`);

  const installPlan = planInstall(spec, "STEAMCMD");
  const baseDir = path.join(dataRoot(), "local-servers", serverId);
  const installDir = path.join(baseDir, installPlan.installSubDir!);
  const logWriter = (msg: string) => appendLog(serverId, msg);

  try {
    await prisma.server.update({
      where: { id: serverId },
      data: { status: "UPDATING" },
    });

    logWriter(`[Update] Starting SteamCMD update for ${server.game} (App ID: ${installPlan.appId})...`);

    setProgress(serverId, { phase: "steam", percent: null, label: "Setting up SteamCMD…" });
    const steamcmdExe = await setupSteamCMD(logWriter);
    setProgress(serverId, { phase: "steam", percent: null, label: "Updating SteamCMD…" });
    await ensureSteamCmdUpdated(steamcmdExe, logWriter);

    const cleanInstallDir = installDir.replace(/\\/g, "/");

    await new Promise<void>((resolve, reject) => {
      // +app_info_update 1 forces a metadata cache refresh before app_update — without it a
      // cold SteamCMD cache yields "Missing configuration" (exit code 8).
      const child = spawn(steamcmdExe, [
        "+force_install_dir", cleanInstallDir,
        "+login", "anonymous",
        "+app_info_update", "1",
        "+app_update", installPlan.appId!,
        "validate",
        "+quit"
      ]);

      let steamErrorDetail = "";
      child.stdout.on("data", (data) => {
        const line = data.toString().trim();
        if (line) {
          const cleanLine = line.replace(/[\r\n]+/g, " ");
          const pct = parseSteamProgress(cleanLine);
          if (pct !== null) {
            setProgress(serverId, {
              phase: "steam",
              percent: pct,
              label: `Updating ${server.game} ${Math.round(pct)}%`,
            });
          }
          if (/ERROR!|Failed to install|No subscription|Invalid Password|Disk write failure/i.test(cleanLine)) {
            steamErrorDetail = cleanLine;
            logWriter(`[Update Error] ${cleanLine}`);
          } else if (cleanLine.includes("progress") || cleanLine.includes("Downloading") || cleanLine.includes("Update state") || cleanLine.includes("Success")) {
            logWriter(`[Update Status] ${cleanLine}`);
          }
        }
      });

      child.stderr.on("data", (data) => {
        const line = data.toString().trim();
        if (line) {
          steamErrorDetail = line.replace(/[\r\n]+/g, " ");
          logWriter(`[Update Warning] ${line}`);
        }
      });

      child.on("close", (code) => {
        if (code === 0) {
          logWriter(`[Update] ${server.game} update completed successfully!`);
          resolve();
        } else {
          const detail = steamErrorDetail ? ` - ${steamErrorDetail}` : " (see steamcmd/logs/console_log.txt for details)";
          reject(new Error(`SteamCMD update exited with code ${code}${detail}`));
        }
      });
    });

    clearProgress(serverId);

    await prisma.server.update({
      where: { id: serverId },
      data: { status: "STOPPED" },
    });

    await prisma.activityLog.create({
      data: {
        userId: server.userId,
        action: "RESTORE_SERVER",
        details: `Updated ${server.game} server '${server.name}' via SteamCMD.`,
      },
    });
  } catch (err: any) {
    clearProgress(serverId);
    logWriter(`[Update] Update failed: ${err.message}`);
    await prisma.server.update({
      where: { id: serverId },
      data: { status: "STOPPED" },
    }).catch(() => {});
    throw err;
  }
}
