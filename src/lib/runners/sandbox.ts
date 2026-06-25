import { spawn } from "child_process";
import path from "path";
import { dataRoot } from "../appPaths";

/**
 * Tests if the game server can boot without crashing for 15 seconds.
 * 
 * @param serverId The ID of the server to test
 * @param game The game type (e.g., VALHEIM, ZOMBOID)
 * @returns true if boot was successful, throws an Error if it crashed
 */
export async function testServerBoot(serverId: string, game: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let exePath = "";
    let args: string[] = [];
    const serverDir = path.join(dataRoot(), "local-servers", serverId);

    // Determine the executable path based on game
    if (game === "VALHEIM") {
      exePath = path.join(serverDir, "valheim-server", "valheim_server.exe");
      args = ["-nographics", "-batchmode", "-name", "SandboxTest", "-port", "2456", "-world", "SandboxTest"];
    } else if (game === "ZOMBOID") {
      exePath = path.join(serverDir, "zomboid-server", "StartServer64.bat");
    } else {
      // Game not supported for sandbox testing, just assume it works
      return resolve(true);
    }

    // Launch the server headlessly
    const proc = spawn(exePath, args, {
      cwd: path.dirname(exePath),
      detached: false, // keep attached so we can kill it
    });

    let stdoutData = "";
    let stderrData = "";

    proc.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    proc.stderr.on("data", (data) => {
      const errStr = data.toString();
      stderrData += errStr;
      
      // Look for severe Unity/BepInEx errors
      if (errStr.includes("NullReferenceException") || errStr.includes("[Error]") || errStr.includes("Exception")) {
        // We found a fatal mod error during boot
        proc.kill("SIGKILL");
        return reject(new Error(`Sandbox Test Failed! Fatal Error detected in logs:\n${errStr.substring(0, 200)}...`));
      }
    });

    proc.on("error", (err) => {
      return reject(new Error(`Failed to start server executable: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== null && code !== 0) {
        return reject(new Error(`Server crashed immediately with exit code ${code}.`));
      }
    });

    // Let it run for 15 seconds, then forcefully terminate it and declare success
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch (e) {
        // Process might already be dead
      }
      resolve(true);
    }, 15000);
  });
}
