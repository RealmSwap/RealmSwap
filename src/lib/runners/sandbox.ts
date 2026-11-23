import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { dataRoot } from "../appPaths";
import { tmlMarkerPath } from "../mods/tml";
import { readLoaderMarker, applyLoaderLaunch, detectMinecraftVersion, javaMajorForMinecraft } from "../mods/mcLoaders";
import { cachedJavaExe } from "../runtimes/javaRuntime";

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
 * RustDedicated prints this after the map has generated and every Oxide/uMod
 * plugin has loaded — the Rust equivalent of Minecraft's Done line.
 */
export function rustBootSucceeded(stdout: string): boolean {
  return /Server startup complete/.test(stdout);
}

/**
 * The java a Minecraft boot test runs on: the cached bundled JRE the real
 * start will use, falling back to PATH java for dev machines. The start path
 * never trusts PATH java (LocalRunner provisions via ensureJava), so a
 * PATH-only lookup here made every boot test silently skip inside the
 * packaged Windows app — exactly the crashes this test exists to catch then
 * shipped to the first real start. The major comes from the server's own MC
 * version (loader marker, else server.jar's version.json) so a wrong-era
 * PATH java can't fail the test for the wrong reason.
 */
export function resolveSandboxJava(
  serverDir: string,
  deps: {
    exists?: (p: string) => boolean;
    dataRoot?: () => string;
    readMarker?: (dir: string) => ReturnType<typeof readLoaderMarker>;
    detectVersion?: (dir: string) => string | null;
  } = {}
): string {
  const exists = deps.exists ?? fs.existsSync;
  const mcVersion =
    (deps.readMarker ?? readLoaderMarker)(serverDir)?.minecraftVersion ??
    (deps.detectVersion ?? detectMinecraftVersion)(serverDir);
  const major = mcVersion ? javaMajorForMinecraft(mcVersion) : 21;
  return cachedJavaExe(major, (deps.dataRoot ?? dataRoot)(), exists) ?? "java";
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
 * Games whose sandbox test actually boots the server (vanilla Minecraft only
 * gets a vacuous pass when its exe is missing, and vanilla Terraria likewise).
 * Every game with a mod pipeline now has a sandbox launcher — the five added
 * here verify installs the same way the original four do. ENSHROUDED and
 * WINDROSE have no mod surface (nothing to boot-test) and auto-pass; install
 * messaging keys off this list so it never claims a boot test that didn't run.
 */
export function hasRealBootTest(game: string): boolean {
  return ["MINECRAFT", "VALHEIM", "ZOMBOID", "TERRARIA", "VRISING", "RUST", "PALWORLD", "SATISFACTORY", "ARK"].includes(game.toUpperCase());
}

/**
 * Tests if the game server can boot without crashing for 15 seconds.
 *
 * @param serverId The ID of the server to test
 * @param game The game type (e.g., VALHEIM, ZOMBOID)
 * @returns true if boot was successful, throws a SandboxBootError (with the
 *          captured boot output) if it crashed
 */
export async function testServerBoot(
  serverId: string,
  game: string,
  /** Live boot output, one line per call — lets install flows surface what the sandboxed server is doing right now. */
  onLine?: (line: string) => void,
  /** Overrides for tests: the no-output stall threshold. */
  opts?: { stallMs?: number }
): Promise<boolean> {
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
      // Mirror the real launch args (builtins): without -cachedir the boot
      // reads a default servertest.ini somewhere else and never exercises
      // the mod list the installer actually edited.
      exePath = "cmd.exe";
      args = [
        "/c", path.join(serverDir, "zomboid-server", "StartServer64.bat"),
        `-cachedir=${path.join(serverDir, "zomboid-server", "zomboid-data")}`,
        "-servername", "servertest",
      ];
      // First boot generates the map and loads every listed mod — a modded
      // boot routinely takes well over the default window.
      sandboxMs = 60000;
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
      // The server exits 0 at the EULA prompt when eula.txt is missing, and a
      // dir that skipped the creation template (imports, hand-built roots)
      // reads as a mysterious ten-minute hang. The app already accepts the
      // EULA at server creation (builtins template) — keep parity here.
      try {
        const eulaPath = path.join(serverDir, "eula.txt");
        if (!fs.existsSync(eulaPath)) fs.writeFileSync(eulaPath, "eula=true\n");
      } catch { /* read-only root — the close handler reports the exit */ }
      // Minecraft gets a REAL boot test — it is the game where silent
      // install damage (missing dependencies, loader mismatch, a pack
      // targeting a different world version) only shows up at boot. Boot
      // with the loader's launch descriptor applied. The window must fit a
      // modded pack's FIRST boot on Windows: cold filesystem cache plus
      // antivirus scanning every jar, and KubeJS running its GraalJS
      // scripts on the unoptimized polyglot runtime (the optimizing Truffle
      // runtime needs JDK 25; loader-derived boot java is 21). A warm macOS
      // repro of ATM10 (499 mods, same Java 21) took ~97s wall to Done;
      // 300s timed out on the Windows first boot, so this is 600s.
      exePath = resolveSandboxJava(serverDir);
      args = minecraftBootArgs(serverDir);
      sandboxMs = readLoaderMarker(serverDir) ? 600000 : 90000;
    } else if (game === "VRISING") {
      // Mirrors the real launch args (builtins) but pins -saveName to a
      // sandbox-only world, so the boot test never loads or autosaves the
      // player's world1 — BepInEx and every Thunderstore plugin load before
      // world init, which is exactly the damage a bad install does.
      const root = path.join(serverDir, "vrising-server");
      try { fs.mkdirSync(path.join(root, "save-data"), { recursive: true }); } catch { /* the close handler reports it */ }
      exePath = path.join(root, "VRisingServer.exe");
      args = ["-persistentDataPath", "./save-data", "-serverName", "SandboxTest", "-saveName", "sandboxtest"];
      sandboxMs = 120000;
    } else if (game === "RUST") {
      // Mirrors the real launch args (builtins) but pins a small world and a
      // sandbox-only identity, so map gen is quick and no save data lands in
      // the real server/servertest dir. The verdict waits for "Server startup
      // complete" — Oxide plugins load before it, so a broken plugin fails
      // the test instead of the player's first start.
      exePath = path.join(serverDir, "rust-server", "RustDedicated.exe");
      args = [
        "-batchmode", "+server.port", "28035", "+server.identity", "sandboxtest",
        "+server.seed", "1337", "+server.worldsize", "1000", "+server.maxplayers", "5",
        "+server.hostname", "SandboxTest", "+rcon.port", "28036", "+rcon.password", "sandboxtest", "+rcon.web", "1",
      ];
      sandboxMs = 300000;
    } else if (game === "PALWORLD") {
      // Mirrors the real launch args (builtins) on a port the real server
      // doesn't use. The game exposes no save-dir override, so this boots in
      // place like ZOMBOID does — UE4SS/shimloader paks load at boot, which is
      // the damage a bad install does, and the installer's snapshot/rollback
      // already guards the files.
      exePath = path.join(serverDir, "palworld-server", "PalServer.exe");
      args = ["?port=8219?players=4", "-useperfthreads", "-NoAsyncLoadingThread", "-UseMultithreadForDS"];
      sandboxMs = 120000;
    } else if (game === "SATISFACTORY") {
      // Mirrors the real launch args (builtins). The dedicated server boots to
      // its idle ready state without loading a world (sessions are claimed via
      // the server API), so surviving the window with no crash is the verdict;
      // SML/ficsit mods load before it, which is the damage a bad install
      // does. Cold asset loads run minutes — the window fits a first boot.
      exePath = path.join(serverDir, "satisfactory-server", "FactoryServer.exe");
      args = ["-log", "-unattended"];
      sandboxMs = 240000;
    } else if (game === "ARK") {
      // Mirrors the real launch args (builtins, minus the password variant —
      // the sandbox session needs no password) on ports the real server
      // doesn't use. -automanagemods makes the server fetch its own workshop
      // mods at boot, so a broken workshop item fails HERE with the server's
      // own output. First boots of TheIsland with a heavy mod list are slow;
      // the window is generous and the installer's snapshot/rollback covers a
      // timeout safely.
      exePath = path.join(serverDir, "ark-server", "ShooterGame", "Binaries", "Win64", "ShooterGameServer.exe");
      args = [
        "TheIsland?SessionName=SandboxTest?Port=7779?QueryPort=27019?MaxPlayers=10",
        "-server", "-nosound", "-QueryPort=27019", "-automanagemods", "-log",
      ];
      sandboxMs = 600000;
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
    // Games with a confirmed ready line (Minecraft's Done line, Rust's
    // "Server startup complete"): reaching it is the verdict — any exit or a
    // window expiry before it fails. The other sandboxed games are survival
    // games: a non-zero exit fails, surviving the window passes (the pattern
    // VALHEIM and ZOMBOID ship on).
    const bootSignal = isMinecraft
      ? minecraftBootSucceeded
      : game === "RUST" ? rustBootSucceeded : null;
    // A booting Minecraft server logs nearly continuously; total output
    // silence means the JVM wedged (live: a mod's init exception froze the
    // process with 0ms CPU while the whole window ticked away). Fail the
    // attempt early so the healer takes over minutes sooner.
    const stallMs = opts?.stallMs ?? 150000;
    let lastOutputAt = Date.now();
    let stallTimer: ReturnType<typeof setInterval> | null = null;

    // A settled test must not return while the sandboxed process still holds
    // the game port: SIGKILL alone races process reaping, and the next
    // create on the same port then 400s on "Port currently in use" (caught
    // by the first nightly heavy run — back-to-back loader boot tests).
    // Wait for exit, not close: children of the killed process (sh wrappers,
    // bat files) can hold stdio long after the killed PID itself is reaped,
    // and the port belongs to the killed PID, not its orphans.
    const settleAfterKill = async () => {
      try { proc.kill("SIGKILL"); } catch (_) {}
      await new Promise<void>((done) => {
        if (proc.exitCode !== null || proc.signalCode) return done();
        const cap = setTimeout(done, 5000);
        proc.once("exit", () => { clearTimeout(cap); done(); });
      });
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      if (stallTimer) clearInterval(stallTimer);
      settleAfterKill().then(() => resolve(true));
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      if (stallTimer) clearInterval(stallTimer);
      settleAfterKill().then(() => reject(new SandboxBootError(message, capturedOutput(stdoutData, stderrData))));
    };

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      stdoutData += text;
      lastOutputAt = Date.now();
      if (onLine) for (const line of text.split(/\r?\n/)) if (line.trim()) onLine(line);
      // A successful boot ends the test immediately — no reason to burn the
      // rest of the window (or the machine's RAM on world gen).
      if (bootSignal && bootSignal(stdoutData)) succeed();
    });

    proc.stderr.on("data", (data) => {
      const errStr = data.toString();
      stderrData += errStr;
      lastOutputAt = Date.now();
      if (onLine) for (const line of errStr.split(/\r?\n/)) if (line.trim()) onLine(line);

      // Minecraft's loaders log stack traces for recoverable warnings on
      // stderr — only the exit code and the Done-line verdict are truth
      // there. Unity/BepInEx games are the same: their servers routinely
      // print benign [Error]/exception lines during a healthy boot (mod
      // load order, shader fallbacks), so a substring scan rolled back good
      // installs. A genuinely broken mod kills the process — the non-zero
      // exit check below is what catches it.
      if (isMinecraft) return;
    });

    proc.on("error", (err) => {
      // Executable missing: on a VANILLA Minecraft server skip the test —
      // nothing to catch, mods aren't loaded. On a MODDED server the boot
      // test is the only thing standing between a client-only mod and the
      // player's first start, so fail loudly instead of silently shipping
      // the install (the v0.5.8 failure class). Non-Minecraft games keep
      // the skip.
      if ((err as any)?.code === "ENOENT") {
        if (isMinecraft && readLoaderMarker(serverDir)) {
          fail(
            "No Java runtime was available for the boot test (neither the bundled runtime nor PATH java). " +
              "Reinstall the loader from the Mods tab — that provisions the bundled runtime — then reinstall this pack."
          );
          return;
        }
        console.log("[Sandbox] Server executable not found. Skipping boot test.");
        settled = true;
        resolve(true);
        return;
      }
      fail(`Failed to start server executable: ${err.message}`);
    });

    proc.on("close", (code) => {
      if (settled) return;
      if (bootSignal) {
        // ANY exit before the ready line fails the test. A clean exit-0 was
        // left pending here until the whole window expired — the install sat
        // "hung" for up to ten minutes after the process was already gone
        // (the EULA prompt exits 0; so do several loader config fatals).
        fail(
          code === 0 || code === null
            ? "The server exited (code " + (code ?? "null") + ") before reaching a successful boot — no ready line."
            : `Server crashed immediately with exit code ${code}.`
        );
      } else if (code !== null && code !== 0) {
        fail(`Server crashed immediately with exit code ${code}.`);
      } else {
        // Non-daemon games: a clean exit is a pass — the old path waited out
        // the whole window before resolving the same verdict.
        settled = true;
        resolve(true);
      }
    });

    // Let it run for the boot window. For Minecraft, expiring without the
    // Done-line is a failure — a server that can't boot in time is exactly
    // the kind of install this test exists to catch.
    if (isMinecraft) {
      // Poll at min(5s, stallMs) so the detection latency is bounded by the
      // configured threshold itself (a 1s stall must not wait for a 5s tick).
      stallTimer = setInterval(() => {
        if (settled) {
          if (stallTimer) clearInterval(stallTimer);
          return;
        }
        if (Date.now() - lastOutputAt > stallMs) {
          fail(
            `The server produced no output for ${Math.round(stallMs / 1000)}s — its boot stalled. ` +
              "The captured output shows how far it got."
          );
        }
      }, Math.min(5000, stallMs));
    }
    setTimeout(async () => {
      if (settled) return;
      if (bootSignal) {
        fail(
          `The server did not reach a successful boot within ${Math.round(sandboxMs / 1000)}s.` +
            (isMinecraft && stdoutData ? " If this is a heavy modpack on a slow machine, it may genuinely need longer — the output below shows how far it got." : "")
        );
      } else {
        settled = true;
        await settleAfterKill();
        resolve(true);
      }
    }, sandboxMs);
  });
}
