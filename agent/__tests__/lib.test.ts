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

// The config-editor file primitives: traversal-guarded small-file read,
// write (with .rsbak parity), listing, and merge-preserving config entries —
// the semantics the dashboard's raw editor and settings saves rely on.

import { readServerFile, writeServerFile, listServerDir, applyConfigEntries, resolveInDataDir } from "../lib";

describe("agent resolveInDataDir", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-lib-test-"));
  });

  it("resolves inside the dir and allows the root itself", () => {
    expect(resolveInDataDir(tmp, "mc-server/server.properties")).toBe(path.resolve(tmp, "mc-server/server.properties"));
    expect(resolveInDataDir(tmp, "")).toBe(path.resolve(tmp));
    expect(resolveInDataDir(tmp, ".")).toBe(path.resolve(tmp));
  });

  it("rejects traversal out of the data dir", () => {
    expect(resolveInDataDir(tmp, "../pwned.txt")).toBeNull();
    expect(resolveInDataDir(tmp, "/../pwned.txt")).toBeNull();
  });
});

describe("agent readServerFile", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-lib-test-"));
  });

  it("reads existing files and reports missing ones without throwing", () => {
    fs.writeFileSync(path.join(tmp, "server.properties"), "motd=hi\n");
    expect(readServerFile(tmp, "server.properties")).toEqual({ ok: true, exists: true, content: "motd=hi\n" });
    expect(readServerFile(tmp, "missing.txt")).toEqual({ ok: true, exists: false, content: null });
  });

  it("refuses files too large for the command channel", () => {
    fs.writeFileSync(path.join(tmp, "big.bin"), Buffer.alloc(3 * 1024 * 1024));
    const result = readServerFile(tmp, "big.bin");
    expect(result.ok).toBe(false);
  });

  it("refuses traversal", () => {
    const result = readServerFile(tmp, "../outside.txt");
    expect(result.ok).toBe(false);
  });
});

describe("agent writeServerFile", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-lib-test-"));
  });

  it("writes with parent creation and optional .rsbak backup", () => {
    fs.mkdirSync(path.join(tmp, "nested/dir"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "nested/dir/a.ini"), "old=1\n");
    const result = writeServerFile(tmp, "nested/dir/a.ini", "new=2\n", true);
    expect(result).toEqual({ ok: true, written: 6 });
    expect(fs.readFileSync(path.join(tmp, "nested/dir/a.ini"), "utf-8")).toBe("new=2\n");
    expect(fs.readFileSync(path.join(tmp, "nested/dir/a.ini.rsbak"), "utf-8")).toBe("old=1\n");
  });

  it("refuses traversal", () => {
    expect(writeServerFile(tmp, "../pwned.txt", "x").ok).toBe(false);
  });
});

describe("agent listServerDir", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-lib-test-"));
  });

  it("lists entries sorted, marking dirs; missing dir is an empty listing", () => {
    fs.mkdirSync(path.join(tmp, "config"));
    fs.writeFileSync(path.join(tmp, "config/b.toml"), "x=1");
    fs.writeFileSync(path.join(tmp, "config/a.toml"), "x=1");
    expect(listServerDir(tmp, "config")).toEqual({
      ok: true,
      entries: [{ name: "a.toml", isDir: false }, { name: "b.toml", isDir: false }],
    });
    expect(listServerDir(tmp, "nope")).toEqual({ ok: true, entries: [] });
  });
});

describe("agent writeConfigFiles merge semantics", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-lib-test-"));
  });

  it("merge:true preserves existing keys the render doesn't manage", () => {
    fs.writeFileSync(path.join(tmp, "server.properties"), "motd=hand-edited\nmax-players=3\n");
    const result = writeConfigFiles(tmp, [
      { relPath: "server.properties", content: "motd=template\nview-distance=8\n", merge: true },
    ]);
    expect(result.ok).toBe(true);
    const merged = fs.readFileSync(path.join(tmp, "server.properties"), "utf-8");
    expect(merged).toContain("motd=template");       // rendered value wins
    expect(merged).toContain("max-players=3");        // hand edit survives
    expect(merged).toContain("view-distance=8");      // new key appended
  });

  it("merge:true on a missing file writes the render verbatim", () => {
    const result = writeConfigFiles(tmp, [{ relPath: "new.ini", content: "a=1\n", merge: true }]);
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(tmp, "new.ini"), "utf-8")).toBe("a=1\n");
  });

  it("merge:false (or omitted) overwrites, matching full-overwrite strategies", () => {
    fs.writeFileSync(path.join(tmp, "enshrouded_server.json"), '{"name":"custom"}');
    writeConfigFiles(tmp, [{ relPath: "enshrouded_server.json", content: '{"name":"rendered"}' }]);
    expect(fs.readFileSync(path.join(tmp, "enshrouded_server.json"), "utf-8")).toBe('{"name":"rendered"}');
  });

  it("applyConfigEntries shares the same merge semantics", () => {
    fs.writeFileSync(path.join(tmp, "servertest.ini"), "Password=old\nMods=BB_X\n");
    const result = applyConfigEntries(tmp, [
      { relPath: "servertest.ini", content: "Password=new\n", merge: true },
    ]);
    expect(result).toEqual({ ok: true, written: 1 });
    const merged = fs.readFileSync(path.join(tmp, "servertest.ini"), "utf-8");
    expect(merged).toContain("Password=new");
    expect(merged).toContain("Mods=BB_X");
  });
});

// Playit tunnel daemon helpers: path validation and the orphan reconcile
// that mirrors the dashboard's boot cleanup on the node.

import { tunnelSecretPath, tunnelSocketPath, tunnelPidPath, reconcileTunnelOrphans } from "../lib";
import { spawn } from "child_process";

describe("agent tunnel paths", () => {
  it("derives per-server paths and refuses hostile server ids", () => {
    const stateDir = "/state";
    expect(tunnelSecretPath(stateDir, "srv1")).toBe(path.join(stateDir, "playit-srv1.toml"));
    expect(tunnelPidPath(stateDir, "srv1")).toBe(path.join(stateDir, "playit-srv1.pid"));
    expect(tunnelSocketPath(stateDir, "srv1")).toContain("playitd-srv1.sock");
    expect(() => tunnelSecretPath(stateDir, "../../etc")).toThrow();
    expect(() => tunnelPidPath(stateDir, "a/b")).toThrow();
  });
});

describe("reconcileTunnelOrphans", () => {
  it("kills untracked daemons by pid file and cleans up; skips tracked ones", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-tunnel-test-"));
    const killed: number[] = [];
    const realKill = process.kill;
    (process as any).kill = (pid: number, signal?: string) => {
      if (pid > 100000) { killed.push(pid); return true; } // fake pids only
      return realKill(pid, signal as never);
    };
    try {
      fs.writeFileSync(path.join(stateDir, "playit-orphan.pid"), "100001");
      fs.writeFileSync(path.join(stateDir, "playit-tracked.pid"), "100002");
      const tracked = new Map([["tracked", {}]]);
      reconcileTunnelOrphans(stateDir, tracked);
      expect(killed).toEqual([100001]);
      expect(fs.existsSync(path.join(stateDir, "playit-orphan.pid"))).toBe(false);
      expect(fs.existsSync(path.join(stateDir, "playit-tracked.pid"))).toBe(true);
    } finally {
      (process as any).kill = realKill;
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
