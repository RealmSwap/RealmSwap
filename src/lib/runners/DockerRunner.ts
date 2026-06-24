import { Server, GameDefinition } from "@/generated/client";
import { ServerRunner, ProcessStats } from "./types";
import { exec } from "child_process";

export class DockerRunner implements ServerRunner {
  private getContainerName(server: Server): string {
    return `realmswap-server-${server.id}`;
  }

  async install(server: Server, definition: GameDefinition | null, onProgress: (pct: number | null, label: string) => void, onLog: (msg: string) => void): Promise<void> {
    onLog("Docker install is implicitly handled during container startup (image pulling).");
  }

  async start(server: Server, definition: GameDefinition | null): Promise<void> {
    const containerName = this.getContainerName(server);
    
    // Check if container already exists
    return new Promise((resolve, reject) => {
      exec(`docker start ${containerName}`, (err, stdout, stderr) => {
        if (!err) {
          resolve();
          return;
        }

        // If it failed to start, it probably doesn't exist. Let's create and run it.
        // This is a naive generic Docker launch.
        // A true implementation would map the definition's installMethod and launch args to Docker mounts and entrypoints.
        const image = "ubuntu:22.04";
        const cmd = `docker run -d --name ${containerName} -v realmswap_data_${server.id}:/data ${image} sleep infinity`;
        
        exec(cmd, (err2, stdout2, stderr2) => {
          if (err2) {
            reject(new Error(`Failed to start Docker container: ${stderr2 || err2.message}`));
          } else {
            resolve();
          }
        });
      });
    });
  }

  async stop(server: Server): Promise<void> {
    const containerName = this.getContainerName(server);
    return new Promise((resolve, reject) => {
      exec(`docker stop ${containerName}`, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Failed to stop Docker container: ${stderr || err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async update(server: Server, definition: GameDefinition | null): Promise<void> {
    // A true implementation would issue `docker pull` for the new image or run steamcmd app_update inside the container.
    throw new Error("Update not yet implemented for Docker Runner");
  }

  async sendCommand(server: Server, command: string): Promise<void> {
    const containerName = this.getContainerName(server);
    return new Promise((resolve, reject) => {
      // NOTE: For Minecraft/RCON, this might not map 1:1 with generic docker exec stdin, but it serves the interface.
      exec(`docker exec ${containerName} bash -c "echo '${command}' > /proc/1/fd/0"`, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Failed to send command to Docker container: ${stderr || err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async getStats(server: Server): Promise<ProcessStats> {
    const containerName = this.getContainerName(server);
    return new Promise((resolve, reject) => {
      exec(`docker stats ${containerName} --no-stream --format "{{.CPUPerc}},{{.MemUsage}}"`, (err, stdout, stderr) => {
        if (err || !stdout) {
          resolve({ cpuPercent: 0, memoryMB: 0 });
          return;
        }
        
        // Output looks like: 0.15%,123MiB / 2GiB
        const parts = stdout.trim().split(",");
        const cpuStr = parts[0].replace("%", "");
        const memStr = parts[1].split(" / ")[0].replace("MiB", "").replace("GiB", "").replace("KiB", ""); // very naive parsing
        
        let memoryMB = parseFloat(memStr);
        if (parts[1].includes("GiB")) memoryMB *= 1024;
        if (parts[1].includes("KiB")) memoryMB /= 1024;

        resolve({
          cpuPercent: parseFloat(cpuStr) || 0,
          memoryMB: memoryMB || 0
        });
      });
    });
  }

  async getLogs(server: Server): Promise<string> {
    const containerName = this.getContainerName(server);
    return new Promise((resolve) => {
      exec(`docker logs --tail 100 ${containerName}`, (err, stdout, stderr) => {
        if (err) {
          resolve(`Error fetching logs: ${err.message}`);
          return;
        }
        resolve(stdout || stderr || "");
      });
    });
  }
}
