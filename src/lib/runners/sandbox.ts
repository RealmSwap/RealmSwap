import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { dataRoot } from "../appPaths";
import { tmlMarkerPath } from "../mods/tml";
import { readLoaderMarker, applyLoaderLaunch } from "../mods/mcLoaders";

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
 * Vanilla + loader servers both announce a successful boot with the
 * "Done (Xs)!" console line — Fabric, Forge, NeoForge and Quilt preserve it.
 */
export function minecraftBootSucceeded(stdout: string): boolean {
  return /Done \(\d/.test(stdout);
}

/**
 * The java command a Minecraft boot test must run: the builtin server.jar
 * launch with the loader's launch descriptor applied (jar swap or @argsfile).
 */
export function minecraftBootArgs(serverDir: string): string[] {
  const marker = readLoaderMarker(serverDir);
  return applyLoaderLaunch(
    ["-jar", "server.jar", "nogui"],
    marker,
    (rel) => fs.existsSync(path.join(serverDir, rel))
  );
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
    let sandboxMs = 15000;
    const serverDir = path.join(dataRoot(), "local-servers", serverId);

    // Determine the executable path based on game
    if (game === "VALHEIM") {
      exePath = path.join(serverDir, "valheim-server", "valheim_server.exe");
      args = ["-nographics", "-batchmode", "-name", "SandboxTest", "-port", "2456", "-world", "SandboxTest"];
    } else if (game === "ZOMBOID") {
      // Batch files must go through cmd.exe — a direct spawn of a .bat throws
      // EINVAL on Node >= 18.20 / Electron (CVE-2024-27980 hardening).
      exePath = "cmd.exe";
      args = ["/c", path.join(serverDir, "zomboid-server", "StartServer64.bat")];
    } else if (game === "TERRARIA") {
      // Only the tModLoader runtime gets a real boot test; vanilla stays
      // vacuous (its exe is a known-quantity Steam install). The directory
      // pins mirror LocalRunner's launch injection so the sandbox boot never
      // writes mod state into the Windows user profile.
      const tmlDir = path.join(serverDir, "tmodloader");
      if (!fs.existsSync(tmlMarkerPath(tmlDir))) {
        return resolve(true);
      }
      const bat = path.join(tmlDir, "start-tModLoaderServer.bat");
      if (!fs.existsSync(bat)) {
        console.log(`[Sandbox] tModLoader start script not found at ${bat}. Skipping boot test.`);
        return resolve(true);
      }
      exePath = "cmd.exe";
      args = [
        "/c", bat, "-nosteam",
        "-tmlsavedirectory", path.join(tmlDir, "tModLoader-server"),
        "-steamworkshopfolder", path.join(tmlDir, "steamapps", "workshop"),
      ];
      sandboxMs = 150000; // first boot may fetch the .NET runtime via LaunchUtils
    } else if (game === "MINECRAFT") {
      // Minecraft gets a REAL boot test — it is the game where silent
      // install damage (missing dependencies, loader mismatch, a pack
      // targeting a different world version) only shows up at boot. Boot
      // with the loader's launch descriptor applied; a modded first boot
      // can take minutes, so its window is generous.
      exePath = "java";
      args = minecraftBootArgs(serverDir);
      sandboxMs = readLoaderMarker(serverDir) ? 300000 : 90000;
    } else {
      // Game not supported for sandbox testing, just assume it works
      return resolve(true);
    }

    // Launch the server headlessly. Bare commands (java, cmd.exe) resolve
    // via PATH at spawn time — a missing one surfaces as ENOENT below; only
    // absolute executables can be pre-checked.
    const onPath = !path.isAbsolute(exePath);
    if (!onPath && !fs.existsSync(exePath)) {
      console.log(`[Sandbox] Server executable not found at ${exePath}. Skipping boot test.`);
      return resolve(true);
    }
    const proc = spawn(exePath, args, {
      // Minecraft reads server.jar, eula.txt and mods/ relative to its cwd.
      cwd: game === "MINECRAFT" ? serverDir : onPath ? serverDir : path.dirname(exePath),
      detached: false, // keep attached so we can kill it
    });

    let stdoutData = "";
    let stderrData = "";
    let settled = false;
    const isMinecraft = game === "MINECRAFT";

    const succeed = () => {
      if (settled) return;
      settled = true;
      try { proc.kill("SIGKILL"); } catch (_) {}
      resolve(true);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      try { proc.kill("SIGKILL"); } catch (_) {}
      reject(new SandboxBootError(message, capturedOutput(stdoutData, stderrData)));
    };

    proc.stdout.on("data", (data) => {
      stdoutData += data.toString();
      // A successful boot ends the test immediately — no reason to burn the
      // rest of the window (or the machine's RAM on world gen).
      if (isMinecraft && minecraftBootSucceeded(stdoutData)) succeed();
    });

    proc.stderr.on("data", (data) => {
      const errStr = data.toString();
      stderrData += errStr;

      // Minecraft's loaders log stack traces for recoverable warnings on
      // stderr — only the exit code and the Done-line verdict are truth
      // there. Unity/BepInEx games keep the string-based fatality check.
      if (isMinecraft) return;
      if (errStr.includes("NullReferenceException") || errStr.includes("[Error]") || errStr.includes("Exception")) {
        fail(`Sandbox Test Failed! Fatal Error detected in logs:\n${errStr.substring(0, 200)}...`);
      }
    });

    proc.on("error", (err) => {
      // Java not installed / not on PATH: skip the test like a missing exe —
      // boot testing must never block an install that may still work.
      if ((err as any)?.code === "ENOENT") {
        console.log("[Sandbox] java not found on PATH. Skipping Minecraft boot test.");
        settled = true;
        resolve(true);
        return;
      }
      fail(`Failed to start server executable: ${err.message}`);
    });

    proc.on("close", (code) => {
      if (!settled && code !== null && code !== 0) {
        fail(`Server crashed immediately with exit code ${code}.`);
      }
    });

    // Let it run for the boot window. For Minecraft, expiring without the
    // Done-line is a failure — a server that can't boot in time is exactly
    // the kind of install this test exists to catch.
    setTimeout(() => {
      if (settled) return;
      if (isMinecraft) {
        fail(
          `Minecraft server did not reach a successful boot within ${Math.round(sandboxMs / 1000)}s.` +
            (stdoutData ? " If this is a heavy modpack on a slow machine, it may genuinely need longer — the output below shows how far it got." : "")
        );
      } else {
        settled = true;
        try { proc.kill("SIGKILL"); } catch (e) {}
        resolve(true);
      }
    }, sandboxMs);
  });
}
