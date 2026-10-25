import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { writeConfigFiles, buildDockerRunArgs, parseStatsLine, timingSafeEqualHex } from "../lib";
import type { StartCommandPayload } from "../../src/lib/agents/protocol";

// The agent's pure core: the traversal-guarded config writer (the agent never
// writes outside its own tree, even from an authenticated dashboard), docker
// argv building parity, and stats parsing.

const startPayload = (overrides: Partial<StartCommandPayload> = {}): StartCommandPayload => ({
  kind: "START",
  dataDirName: "srv",
  configFiles: [],
  containerName: "realmswap-server-srv",
  image: "cm2network/steamcmd",
  ports: [{ port: 28015, protocol: "UDP" }],
  env: { SteamAppId: "258550" },
  entrypoint: "exec ./RustDedicated",
  readyFallbackMs: 300000,
  ...overrides,
});

describe("agent writeConfigFiles", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-lib-test-"));
  });

  it("writes config files under the data dir, creating parents", () => {
    const result = writeConfigFiles(tmp, [
      { relPath: "rust/server.cfg", content: "a=b\n" },
      { relPath: "root.toml", content: "x=1\n" },
    ]);
    expect(result).toEqual({ ok: true, written: 2 });
    expect(fs.readFileSync(path.join(tmp, "rust/server.cfg"), "utf-8")).toBe("a=b\n");
    expect(fs.readFileSync(path.join(tmp, "root.toml"), "utf-8")).toBe("x=1\n");
  });

  it("refuses traversal out of the data dir", () => {
    const outside = path.join(path.dirname(tmp), "pwned.txt");
    const result = writeConfigFiles(tmp, [
      { relPath: "../pwned.txt", content: "nope" },
    ]);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("escapes the server data dir") });
    expect(fs.existsSync(outside)).toBe(false);
  });

  it("refuses .. traversal even when it rides an absolute segment", () => {
    // path.join concatenates absolute segments, so "/../pwned" only escapes
    // after resolve normalizes the ".." — the guard must catch exactly that.
    const outside = path.join(path.dirname(tmp), "pwned.txt");
    const result = writeConfigFiles(tmp, [
      { relPath: "/../pwned.txt", content: "nope" },
    ]);
    expect(result.ok).toBe(false);
    expect(fs.existsSync(outside)).toBe(false);
  });
});

describe("agent buildDockerRunArgs", () => {
  it("mirrors buildRunArgs: volume, ports, env, bash -lc entrypoint", () => {
    const args = buildDockerRunArgs(startPayload(), "/data-root/srv");
    expect(args).toEqual([
      "run", "-d", "--name", "realmswap-server-srv",
      "-v", "/data-root/srv:/data",
      "-p", "28015:28015/udp",
      "-e", "SteamAppId=258550",
      "cm2network/steamcmd", "bash", "-lc", "exec ./RustDedicated",
    ]);
  });

  it("omits env and ports when absent", () => {
    const args = buildDockerRunArgs(startPayload({ env: null, ports: [] }), "/d");
    expect(args).not.toContain("-e");
    expect(args).not.toContain("-p");
  });
});

describe("agent parseStatsLine", () => {
  it("parses docker stats output", () => {
    expect(parseStatsLine("12.5%,512MiB/4GiB\n")).toEqual({ cpuPercent: 12.5, memoryMB: 512 });
    expect(parseStatsLine("0.00%,2.5GiB/16GiB")).toEqual({ cpuPercent: 0, memoryMB: 2560 });
    expect(parseStatsLine("100%,1KiB/1GiB")).toEqual({ cpuPercent: 100, memoryMB: 1 / 1024 });
    expect(parseStatsLine("")).toBeNull();
  });
});

describe("agent timingSafeEqualHex", () => {
  it("matches equal strings and rejects different ones", () => {
    const a = "a".repeat(64);
    expect(timingSafeEqualHex(a, "a".repeat(64))).toBe(true);
    expect(timingSafeEqualHex(a, "b".repeat(64))).toBe(false);
    expect(timingSafeEqualHex(a, "short")).toBe(false);
  });
});

import { buildTarArgs, installStagedTree } from "../lib";

describe("agent buildTarArgs", () => {
  it("roots the archive at baseDir", () => {
    expect(buildTarArgs("/data", ["srv/world"], "/tmp/out.tar")).toEqual([
      "-cf", "/tmp/out.tar", "-C", "/data", "srv/world",
    ]);
  });
});

describe("agent installStagedTree", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-swap-test-"));
  });

  it("swap replaces the dest dir wholesale and cleans up the backup", () => {
    const dest = path.join(root, "world");
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, "old.txt"), "old");
    const staged = path.join(root, "staged");
    fs.mkdirSync(staged);
    fs.writeFileSync(path.join(staged, "new.txt"), "new");

    expect(installStagedTree(staged, dest, "swap")).toEqual({ ok: true });
    expect(fs.readdirSync(dest)).toEqual(["new.txt"]);
    expect(fs.existsSync(`${dest}.pre-restore`)).toBe(false);
  });

  it("overlay adds and overwrites without deleting sibling files (Valheim worlds)", () => {
    const dest = path.join(root, "worlds");
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, "OtherWorld.db"), "keep");
    fs.writeFileSync(path.join(dest, "Dedicated.db"), "stale");
    const staged = path.join(root, "staged");
    fs.mkdirSync(staged);
    fs.writeFileSync(path.join(staged, "Dedicated.db"), "fresh");

    expect(installStagedTree(staged, dest, "overlay")).toEqual({ ok: true });
    expect(fs.readdirSync(dest).sort()).toEqual(["Dedicated.db", "OtherWorld.db"]);
    expect(fs.readFileSync(path.join(dest, "Dedicated.db"), "utf-8")).toBe("fresh");
    expect(fs.readFileSync(path.join(dest, "OtherWorld.db"), "utf-8")).toBe("keep");
  });

  it("swap failure rolls the old dir back into place", () => {
    const dest = path.join(root, "world");
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, "old.txt"), "old");
    const staged = path.join(root, "staged");
    fs.mkdirSync(staged);
    fs.writeFileSync(path.join(staged, "new.txt"), "new");
    // Force the second rename to fail: dest is suddenly occupied again by an
    // adversary between the two renames — simulate via a directory that can't
    // be moved over (non-empty existing dir where dest must go).
    const blocker = path.join(root, "blocker");
    fs.mkdirSync(blocker);
    const realRename = fs.renameSync;
    let calls = 0;
    (fs as any).renameSync = (...args: [fs.PathLike, fs.PathLike]) => {
      calls += 1;
      if (calls === 2) throw new Error("simulated failure");
      return realRename(args[0], args[1]);
    };
    try {
      const result = installStagedTree(staged, dest, "swap");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("simulated failure");
      expect(fs.readFileSync(path.join(dest, "old.txt"), "utf-8")).toBe("old");
    } finally {
      (fs as any).renameSync = realRename;
    }
  });
});
