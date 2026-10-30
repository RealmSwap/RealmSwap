import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { minecraftBootSucceeded, minecraftBootArgs, resolveSandboxJava, testServerBoot, SandboxBootError } from "../sandbox";

describe("minecraftBootSucceeded", () => {
  it("recognizes the vanilla and loader Done line", () => {
    expect(minecraftBootSucceeded('[12:00:01] [Server thread/INFO]: Done (4.213s)! For help, type "help"')).toBe(true);
    expect(minecraftBootSucceeded("[12:00:01] [Server thread/INFO] [minecraft/DedicatedServer]: Done (12.5s)! For help")).toBe(true);
  });
  it("does not fire on startup noise", () => {
    expect(minecraftBootSucceeded("Starting minecraft server version 1.21.1\nLoading properties\nPreparing level")).toBe(false);
    expect(minecraftBootSucceeded("Done loading mods list")).toBe(false);
  });
});

describe("minecraftBootArgs", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-args-"));
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("boots vanilla with -jar server.jar when no loader marker exists", () => {
    expect(minecraftBootArgs(dir)).toEqual(["-jar", "server.jar", "nogui"]);
  });

  it("applies a jar-swap loader launch (Fabric) when the launcher exists", () => {
    const root = path.join(dir, "fabric");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "fabric-server-launch.jar"), "x");
    fs.writeFileSync(
      path.join(root, "realmswap-loader.json"),
      JSON.stringify({ type: "fabric", loaderVersion: "0.16.9", minecraftVersion: "1.21.1", installedAt: "", launch: { kind: "jar", file: "fabric-server-launch.jar" } })
    );
    expect(minecraftBootArgs(root)).toEqual(["-jar", "fabric-server-launch.jar", "nogui"]);
  });

  it("applies an @argsfile launch (NeoForge) when the args file exists", () => {
    const root = path.join(dir, "neoforge");
    fs.mkdirSync(path.join(root, "libraries", "net", "neoforged", "neoforge", "21.1.95"), { recursive: true });
    const rel = "libraries/net/neoforged/neoforge/21.1.95/win_args.txt";
    fs.writeFileSync(path.join(root, rel), "-p libs");
    fs.writeFileSync(
      path.join(root, "realmswap-loader.json"),
      JSON.stringify({ type: "neoforge", loaderVersion: "21.1.95", minecraftVersion: "1.21.1", installedAt: "", launch: { kind: "argsFile", file: rel } })
    );
    expect(minecraftBootArgs(root)).toEqual([`@${rel}`, "nogui"]);
  });

  it("falls back to vanilla when the marker's launch file is missing (half-installed loader)", () => {
    const root = path.join(dir, "broken");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, "realmswap-loader.json"),
      JSON.stringify({ type: "fabric", loaderVersion: "0.16.9", minecraftVersion: "1.21.1", installedAt: "", launch: { kind: "jar", file: "fabric-server-launch.jar" } })
    );
    expect(minecraftBootArgs(root)).toEqual(["-jar", "server.jar", "nogui"]);
  });
});

/**
 * The boot test must resolve java the same way the real start does — the
 * bundled ensureJava JRE first, PATH java only as a dev fallback. A PATH-only
 * lookup here silently skipped every boot test in the packaged Windows app
 * (no java on the app's PATH), so client-only mods reached the first real
 * start (seen live: ATM10's Dark Mode Everywhere crashed it 2026-10-27).
 */
describe("resolveSandboxJava", () => {
  const bundled = (root: string, major: number) =>
    path.join(root, "runtimes", `jdk-${major}`, "bin", "java.exe");

  it("prefers the bundled JRE matching the loader marker's MC version", () => {
    const picked = resolveSandboxJava("/srv", {
      exists: (p) => p === bundled("/data", 21),
      dataRoot: () => "/data",
      readMarker: () => ({ type: "neoforge", loaderVersion: "21.1.95", minecraftVersion: "1.21.1", installedAt: "" }),
      detectVersion: () => "1.20.1",
    });
    expect(picked).toBe(bundled("/data", 21));
  });

  it("derives the major from server.jar's version.json when no marker exists", () => {
    const picked = resolveSandboxJava("/srv", {
      exists: (p) => p === bundled("/data", 17),
      dataRoot: () => "/data",
      readMarker: () => null,
      detectVersion: () => "1.19.2",
    });
    expect(picked).toBe(bundled("/data", 17));
  });

  it("defaults to major 21 when no version info is available", () => {
    const picked = resolveSandboxJava("/srv", {
      exists: (p) => p === bundled("/data", 21),
      dataRoot: () => "/data",
      readMarker: () => null,
      detectVersion: () => null,
    });
    expect(picked).toBe(bundled("/data", 21));
  });

  it("falls back to PATH java when no bundled runtime is cached (dev machines)", () => {
    expect(
      resolveSandboxJava("/srv", {
        exists: () => false,
        dataRoot: () => "/data",
        readMarker: () => null,
        detectVersion: () => "1.21.1",
      })
    ).toBe("java");
  });

  it("does not pick a bundled JRE of the wrong era", () => {
    const picked = resolveSandboxJava("/srv", {
      exists: (p) => p === bundled("/data", 8),
      dataRoot: () => "/data",
      readMarker: () => null,
      detectVersion: () => "1.21.1",
    });
    expect(picked).toBe("java");
  });
});

/**
 * Real-spawn verdict tests: a fake `java` shell script on PATH plays the
 * server. Each scenario writes a different script so the sandbox's
 * Minecraft verdict rules (Done-line success, non-zero exit failure, stderr
 * stack traces tolerated) are exercised against a live child process.
 */
describe("testServerBoot — Minecraft verdicts (fake java on PATH)", () => {
  const SAVED_PATH = process.env.PATH;
  const SAVED_DATA = process.env.GAMEVAULT_DATA_DIR;
  let binDir = "";
  let emptyBin = "";
  let dataDir = "";
  const serverId = "mc-sandbox";

  beforeAll(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-java-"));
    emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), "no-java-"));
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-data-"));
    fs.mkdirSync(path.join(dataDir, "local-servers", serverId), { recursive: true });
    process.env.GAMEVAULT_DATA_DIR = dataDir;
    process.env.PATH = `${binDir}${path.delimiter}${SAVED_PATH}`;
  });
  afterAll(() => {
    process.env.PATH = SAVED_PATH;
    if (SAVED_DATA === undefined) delete process.env.GAMEVAULT_DATA_DIR;
    else process.env.GAMEVAULT_DATA_DIR = SAVED_DATA;
    fs.rmSync(binDir, { recursive: true, force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function fakeJava(script: string) {
    const p = path.join(binDir, "java");
    fs.writeFileSync(p, `#!/bin/sh\n${script}\n`);
    fs.chmodSync(p, 0o755);
  }

  const posixOnly = process.platform === "win32" ? it.skip : it;

  posixOnly("passes as soon as the Done line appears, without waiting out the window", async () => {
    fakeJava('echo "Starting minecraft server"; echo "Done (3.1s)! For help, type help"; sleep 30');
    const started = Date.now();
    await expect(testServerBoot(serverId, "MINECRAFT")).resolves.toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  posixOnly("fails on a non-zero exit before Done, carrying the captured output", async () => {
    fakeJava('echo "Loading mods"; echo "Missing dependency: fancylib" 1>&2; exit 1');
    const err = await testServerBoot(serverId, "MINECRAFT").catch((e) => e);
    expect(err).toBeInstanceOf(SandboxBootError);
    expect(err.message).toMatch(/exit code 1/);
    expect(err.output).toMatch(/Missing dependency: fancylib/);
  });

  posixOnly("tolerates stack traces on stderr when the boot still reaches Done", async () => {
    fakeJava('echo "java.lang.Exception: harmless warning" 1>&2; echo "Done (2.0s)!"; sleep 30');
    await expect(testServerBoot(serverId, "MINECRAFT")).resolves.toBe(true);
  });

  posixOnly("fails fast on a clean exit-0 before Done instead of hanging out the window", async () => {
    // The EULA prompt (and several loader config fatals) exit 0. This used to
    // leave the promise pending until the whole 600s window expired — the
    // install sat "hung" after the process was already gone.
    fakeJava('echo "You need to agree to the EULA"; exit 0');
    const started = Date.now();
    const err = await testServerBoot(serverId, "MINECRAFT").catch((e) => e);
    expect(err).toBeInstanceOf(SandboxBootError);
    expect(err.message).toMatch(/exited \(code 0\)/);
    expect(err.output).toMatch(/agree to the EULA/);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  posixOnly("writes eula.txt into the server dir when it is missing", async () => {
    fakeJava('echo "Done (1.0s)!"');
    const dir = path.join(dataDir, "local-servers", "mc-eula-missing");
    fs.mkdirSync(dir, { recursive: true });
    await expect(testServerBoot("mc-eula-missing", "MINECRAFT")).resolves.toBe(true);
    expect(fs.readFileSync(path.join(dir, "eula.txt"), "utf8")).toContain("eula=true");
  });

  posixOnly("forwards live boot output lines to onLine", async () => {
    // The sleep guarantees the stderr data event delivers before the Done
    // line's early-exit kills the process — back-to-back writes raced the
    // kill on fast pipes and dropped the stderr line.
    fakeJava('echo "Loading mods"; echo "fatal boom" 1>&2; sleep 1; echo "Done (1.5s)!"');
    const lines: string[] = [];
    await expect(testServerBoot(serverId, "MINECRAFT", (l) => lines.push(l))).resolves.toBe(true);
    expect(lines).toContain("Loading mods");
    expect(lines).toContain("fatal boom");
    expect(lines.some((l) => l.startsWith("Done (1.5s)!"))).toBe(true);
  });

  posixOnly("fails a wedged server on output silence instead of burning the whole window", async () => {
    // Live shape (Homestead 2.0.1, 2026-10-30): a mod's init exception froze
    // the JVM at 0ms CPU with no further output while the 600s window ran
    // out. The stall detector must hand the attempt to the healer minutes
    // sooner. Short threshold so the test stays fast; sleep keeps the
    // process alive to prove it's the silence — not the exit — that fails.
    fakeJava('echo "Loading mods"; sleep 30');
    const started = Date.now();
    const err = await testServerBoot(serverId, "MINECRAFT", undefined, { stallMs: 1000 }).catch((e) => e);
    expect(err).toBeInstanceOf(SandboxBootError);
    expect(err.message).toMatch(/no output for 1s — its boot stalled/);
    expect(Date.now() - started).toBeLessThan(15000);
  });

  it("skips a missing java on a VANILLA server but fails loud on a MODDED one", async () => {
    // No java anywhere on PATH for this scenario.
    process.env.PATH = emptyBin;
    try {
      // Vanilla (no loader marker): nothing to catch — mods aren't loaded.
      await expect(testServerBoot("mc-vanilla-noexe", "MINECRAFT")).resolves.toBe(true);

      // Modded (loader marker present): the boot test is the only guard
      // against client-only mods shipping — a missing runtime must fail
      // the install loudly, not silently skip it (the v0.5.8 bug class).
      fs.mkdirSync(path.join(dataDir, "local-servers", "mc-modded-noexe"), { recursive: true });
      fs.writeFileSync(
        path.join(dataDir, "local-servers", "mc-modded-noexe", "realmswap-loader.json"),
        JSON.stringify({ type: "neoforge", loaderVersion: "21.1.95", minecraftVersion: "1.21.1", installedAt: "", launch: { kind: "jar", file: "x.jar" } })
      );
      const err = await testServerBoot("mc-modded-noexe", "MINECRAFT").catch((e) => e);
      expect(err).toBeInstanceOf(SandboxBootError);
      expect(err.message).toMatch(/No Java runtime was available/);
    } finally {
      process.env.PATH = `${binDir}${path.delimiter}${SAVED_PATH}`;
    }
  });
});
