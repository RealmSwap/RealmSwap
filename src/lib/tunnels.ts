import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import { spawn, ChildProcess } from "child_process";
import { dataRoot } from "./appPaths";
import { prisma } from "./db";

const BIN_DIR = path.join(dataRoot(), "bin");

// Map of running tunnels (serverId -> ChildProcess)
const runningTunnels = new Map<string, ChildProcess>();

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

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(binPath);
    https.get(downloadUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        https.get(response.headers.location!, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on("finish", () => {
            file.close();
            if (platform !== "win32") fs.chmodSync(binPath, "755");
            resolve(binPath);
          });
        }).on("error", (err) => {
          fs.unlinkSync(binPath);
          reject(err);
        });
        return;
      }

      response.pipe(file);
      file.on("finish", () => {
        file.close();
        if (platform !== "win32") fs.chmodSync(binPath, "755");
        console.log("[Tunnel] Playit download complete.");
        resolve(binPath);
      });
    }).on("error", (err) => {
      fs.unlinkSync(binPath);
      reject(err);
    });
  });
}

export async function startTunnel(serverId: string, port: number) {
  if (runningTunnels.has(serverId)) return;

  try {
    const binPath = await downloadPlayitBinary();
    
    // Playit doesn't have a simple "bind to port X" CLI argument that bypasses the account linking prompt cleanly without a secret.
    // However, for this MVP, we will spawn the process. In a real environment, users need to claim the agent 
    // using the provided claim link, then configure the port on the playit dashboard.
    // We will parse the stdout to find the claim link or the assigned URL and save it to the DB.

    const playitProcess = spawn(binPath, [], {
      cwd: BIN_DIR,
      env: process.env
    });

    runningTunnels.set(serverId, playitProcess);

    playitProcess.stdout.on("data", async (data) => {
      const output = data.toString();
      
      // Attempt to parse playit URLs (e.g. xxx.auto.playit.gg)
      const match = output.match(/([a-z0-9-]+\.auto\.playit\.gg)/);
      if (match) {
        const tunnelUrl = match[1];
        await prisma.server.update({
          where: { id: serverId },
          data: { tunnelUrl }
        });
      }
      
      // Also look for claim links so the user can claim it
      const claimMatch = output.match(/(https:\/\/playit\.gg\/claim\/[a-zA-Z0-9]+)/);
      if (claimMatch) {
         console.log(`[Tunnel] Server ${serverId} Claim Link: ${claimMatch[1]}`);
      }
    });

    playitProcess.stderr.on("data", (data) => {
      // console.error(`[Tunnel] ${data.toString()}`);
    });

    playitProcess.on("close", () => {
      console.log(`[Tunnel] Playit process for ${serverId} exited.`);
      runningTunnels.delete(serverId);
      prisma.server.update({
        where: { id: serverId },
        data: { tunnelUrl: null }
      }).catch(() => {});
    });

  } catch (err) {
    console.error("[Tunnel] Failed to start tunnel:", err);
  }
}

export function stopTunnel(serverId: string) {
  const process = runningTunnels.get(serverId);
  if (process) {
    process.kill();
    runningTunnels.delete(serverId);
  }
}
