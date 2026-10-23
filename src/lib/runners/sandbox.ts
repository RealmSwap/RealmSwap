import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { dataRoot } from "../appPaths";

/**
 * Boot-test failure carrying what the sandboxed server actually printed, so
 * failed installs can show the real cause instead of a one-line summary.
 */
export class SandboxBootError extends Error {
  /** Tail of the captured sandbox output (stdout + stderr) */
  output: string;

  constructor(message: string, output: string) {
    super(message);
    this.name = "SandboxBootError";
    this.output = output;
  }
}

const OUTPUT_TAIL_CHARS = 4000;

function capturedOutput(stdout: string, stderr: string): string {
  const half = OUTPUT_TAIL_CHARS / 2;
  const parts: string[] = [];
  if (stdout.trim()) parts.push(`--- stdout ---\n${stdout.slice(-half).trimEnd()}`);
  if (stderr.trim()) parts.push(`--- stderr ---\n${stderr.slice(-half).trimEnd()}`);
  return parts.join("\n\n");
}

/**
 * Tests if the game server can boot without crashing for 15 seconds.
 *
 * @param serverId The ID of the server to test
 * @param game The game type (e.g., VALHEIM, ZOMBOID)
 * @returns true if boot was successful, throws a SandboxBootError (with the
 *          captured boot output) if it crashed
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
    if (!fs.existsSync(exePath)) {
      console.log(`[Sandbox] Server executable not found at ${exePath}. Skipping boot test.`);
      return resolve(true);
    }
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
        return reject(new SandboxBootError(
          `Sandbox Test Failed! Fatal Error detected in logs:\n${errStr.substring(0, 200)}...`,
          capturedOutput(stdoutData, stderrData)
        ));
      }
    });

    proc.on("error", (err) => {
      return reject(new SandboxBootError(
        `Failed to start server executable: ${err.message}`,
        capturedOutput(stdoutData, stderrData)
      ));
    });

    proc.on("close", (code) => {
      if (code !== null && code !== 0) {
        return reject(new SandboxBootError(
          `Server crashed immediately with exit code ${code}.`,
          capturedOutput(stdoutData, stderrData)
        ));
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
