import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { minecraftBootSucceeded, minecraftBootArgs, testServerBoot, SandboxBootError } from "../sandbox";

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
 * Real-spawn verdict tests: a fake `java` shell script on PATH plays the
 * server. Each scenario writes a different script so the sandbox's
 * Minecraft verdict rules (Done-line success, non-zero exit failure, stderr
 * stack traces tolerated) are exercised against a live child process.
 */
describe("testServerBoot — Minecraft verdicts (fake java on PATH)", () => {
  const SAVED_PATH = process.env.PATH;
  const SAVED_DATA = process.env.GAMEVAULT_DATA_DIR;
  let binDir = "";
  let dataDir = "";
  const serverId = "mc-sandbox";

  beforeAll(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-java-"));
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
});
