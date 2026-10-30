import fs from "fs";
import path from "path";
import https from "https";
import AdmZip from "adm-zip";
import checkDiskSpace from "check-disk-space";
import { spawn } from "child_process";
import { computePercent } from "../downloadProgress";
import { dataRoot } from "../appPaths";
import { runSteamAppUpdate } from "./appUpdate";

const STEAMCMD_ZIP_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

// Download utility. onProgress receives a 0..100 percent, or null when the
// server does not send a Content-Length header (indeterminate).
export function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number | null) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    // Write-stream failures (disk full, permissions) surface here, not on the
    // request — unhandled, they are a fatal 'error' event that takes the whole
    // dashboard process down mid-install.
    file.on("error", (err) => {
      clearTimeout(stall);
      req.destroy();
      fs.unlink(dest, () => {});
      reject(err);
    });
    // A stalled connection must not hang the install (and the STARTING status)
    // forever.
    const stall = setTimeout(() => {
      req.destroy();
      file.destroy();
      fs.unlink(dest, () => {});
      reject(new Error("Download stalled: no data received for 30 seconds"));
    }, 30000);
    const req = https.get(url, (response) => {
      if (response.statusCode !== 200) {
        clearTimeout(stall);
        file.destroy();
        fs.unlink(dest, () => {});
        reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        return;
      }
      const total = parseInt(response.headers["content-length"] || "", 10);
      let received = 0;
      let lastEmit = 0;
      if (onProgress) onProgress(computePercent(received, total));
      response.on("data", (chunk) => {
        stall.refresh();
        received += chunk.length;
        const now = Date.now();
        // Throttle to ~4x/sec to avoid spamming the store on every chunk.
        if (onProgress && now - lastEmit >= 250) {
          lastEmit = now;
          onProgress(computePercent(received, total));
        }
      });
      response.on("error", (err) => {
        clearTimeout(stall);
        fs.unlink(dest, () => {});
        reject(err);
      });
      response.pipe(file);
      file.on("finish", () => {
        clearTimeout(stall);
        file.close();
        if (onProgress) onProgress(computePercent(received, total));
        resolve();
      });
    }).on("error", (err) => {
      clearTimeout(stall);
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
      onLog("Extracting steamcmd.zip...");

      try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(steamcmdDir, true);
        try { fs.unlinkSync(zipPath); } catch (_) {}
        onLog("SteamCMD successfully configured!");
        resolve(exePath);
      } catch (err: any) {
        try { fs.unlinkSync(zipPath); } catch (_) {}
        reject(new Error(`Failed to extract SteamCMD: ${err.message}`));
      }
    } catch (err: any) {
      reject(err);
    }
  });
}

// Helper to query free disk space in GB using cross-platform check-disk-space
async function getFreeDiskSpaceGB(dir: string): Promise<number> {
  try {
    const rootPath = path.parse(path.resolve(dir)).root;
    const space = await checkDiskSpace(rootPath);
    return parseFloat((space.free / (1024 * 1024 * 1024)).toFixed(2));
  } catch (err) {
    return -1;
  }
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
export function installSteamCmdApp(
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

      await runSteamAppUpdate({
        steamcmdExe,
        installDir,
        appId,
        onLog,
        onProgress: (pct) => onProgress?.({ percent: pct, label: `Downloading ${appName} ${Math.round(pct)}%` }),
        onRetry: () => onProgress?.({ percent: null, label: "Preparing SteamCMD…" }),
        successCheck: () => fs.existsSync(exePath),
        tags: { error: "[SteamCMD Error]", status: "[SteamCMD Status]" },
      });
      onLog(`${appName} download completed!`);
      resolve();
    } catch (err: any) {
      reject(err);
    }
  });
}
