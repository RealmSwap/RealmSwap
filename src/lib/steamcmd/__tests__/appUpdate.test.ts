import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import {
  runSteamAppUpdate,
  classifySteamFailure,
  resetSteamCmdCache,
  steamCmdCachePaths,
  SteamAppUpdateError,
} from "../appUpdate";

type Script = { stdout?: string[]; stderr?: string[]; code?: number | null; spawnError?: string };

// Children must be returned synchronously (listeners attach right after spawn);
// output is emitted on the next tick, one scripted run per attempt.
function fakeSpawn(scripts: Script[]) {
  const calls: { exe: string; args: string[] }[] = [];
  const spawnImpl = ((exe: string, args: string[]) => {
    calls.push({ exe, args });
    const script = scripts[Math.min(calls.length - 1, scripts.length - 1)];
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      if (script.spawnError) {
        child.emit("error", new Error(script.spawnError));
        return;
      }
      for (const l of script.stdout ?? []) child.stdout.emit("data", Buffer.from(l + "\n"));
      for (const l of script.stderr ?? []) child.stderr.emit("data", Buffer.from(l + "\n"));
      child.emit("close", script.code ?? 0);
    });
    return child;
  }) as any;
  return { spawnImpl, calls };
}

function fakeCache(existing: string[]) {
  const present = new Set(existing);
  const removed: string[] = [];
  return {
    exists: (p: string) => present.has(p),
    remove: (p: string) => {
      present.delete(p);
      removed.push(p);
    },
    removed,
  };
}

const EXE = "/data/steamcmd/steamcmd.exe";
const APPCACHE = "/data/steamcmd/appcache";
const CONFIG_VDF = "/data/steamcmd/config/config.vdf";

// Verbatim shape of the failure that broke an Enshrouded update on a real install.
const TIMEOUT_RUN: Script = {
  stdout: [
    "Loading Steam API...OK",
    "Connecting anonymously to Steam Public...OK",
    "Waiting for client config...ERROR! Info Request for AppId 7 returned error Timeout.",
    "Waiting for user info...OK",
    "ERROR! Info request for AppID 2278520 returned error Timeout.",
    "Unloading Steam API...OK",
  ],
  code: 8,
};
const OK_RUN: Script = {
  stdout: ["Update state (0x61) downloading, progress: 42.50 (425 / 1000)", "Success! App '2278520' fully installed."],
  code: 0,
};

function harness(scripts: Script[], existingCache = [APPCACHE, CONFIG_VDF]) {
  const spawn = fakeSpawn(scripts);
  const cache = fakeCache(existingCache);
  const sleeps: number[] = [];
  const logs: string[] = [];
  const retries: number[] = [];
  const progress: number[] = [];
  const deps = {
    spawnImpl: spawn.spawnImpl,
    exists: cache.exists,
    remove: cache.remove,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
  const base = {
    steamcmdExe: EXE,
    installDir: "C:\\data\\local-servers\\s1\\enshrouded-server",
    appId: "2278520",
    onLog: (m: string) => logs.push(m),
    onProgress: (p: number) => progress.push(p),
    onRetry: (n: number) => retries.push(n),
    tags: { error: "[Update Error]", status: "[Update Status]" },
  };
  return { spawn, cache, sleeps, logs, retries, progress, deps, base };
}

describe("classifySteamFailure", () => {
  it("timeouts and missing-config are the cache class (reset + retry)", () => {
    expect(classifySteamFailure(8, "ERROR! Info request for AppID 2278520 returned error Timeout.")).toBe("cache");
    expect(classifySteamFailure(8, "")).toBe("cache");
    expect(classifySteamFailure(7, "ERROR! Failed to install app '2278520' (Missing configuration)")).toBe("cache");
    expect(classifySteamFailure(1, "Update state (0x0) Timed out")).toBe("cache");
  });
  it("account/disk problems are fatal and never retried", () => {
    expect(classifySteamFailure(1, "ERROR! Failed to install app '2278520' (No subscription)")).toBe("fatal");
    expect(classifySteamFailure(1, "Invalid Password")).toBe("fatal");
    expect(classifySteamFailure(1, "ERROR! Disk write failure")).toBe("fatal");
  });
  it("anything else non-zero is transient", () => {
    expect(classifySteamFailure(3, "")).toBe("transient");
    expect(classifySteamFailure(null, "")).toBe("transient");
  });
});

describe("resetSteamCmdCache", () => {
  it("targets appcache/ and config/config.vdf beside steamcmd.exe", () => {
    expect(steamCmdCachePaths(EXE)).toEqual([APPCACHE, CONFIG_VDF]);
  });
  it("removes only what exists and reports basenames", () => {
    const cache = fakeCache([APPCACHE]);
    expect(resetSteamCmdCache(EXE, cache)).toEqual(["appcache"]);
    expect(cache.removed).toEqual([APPCACHE]);
    expect(resetSteamCmdCache(EXE, cache)).toEqual([]);
  });
});

describe("runSteamAppUpdate", () => {
  it("succeeds first try with the canonical SteamCMD argv and forward-slash install dir", async () => {
    const h = harness([OK_RUN]);
    const res = await runSteamAppUpdate(h.base, h.deps);
    expect(res).toEqual({ attempts: 1, alreadyUpToDate: false, cacheReset: false });
    expect(h.spawn.calls).toHaveLength(1);
    expect(h.spawn.calls[0].exe).toBe(EXE);
    expect(h.spawn.calls[0].args).toEqual([
      "+force_install_dir", "C:/data/local-servers/s1/enshrouded-server",
      "+login", "anonymous",
      "+app_info_update", "1",
      "+app_update", "2278520",
      "validate",
      "+quit",
    ]);
    expect(h.progress).toEqual([42.5]);
    expect(h.logs).toContain("[Update Status] Update state (0x61) downloading, progress: 42.50 (425 / 1000)");
    expect(h.sleeps).toEqual([]);
    expect(h.cache.removed).toEqual([]);
  });

  it("on the real-world app-info timeout: resets the cache once, then the retry succeeds", async () => {
    const h = harness([TIMEOUT_RUN, OK_RUN]);
    const res = await runSteamAppUpdate(h.base, h.deps);
    expect(res).toEqual({ attempts: 2, alreadyUpToDate: false, cacheReset: true });
    expect(h.cache.removed).toEqual([APPCACHE, CONFIG_VDF]);
    expect(h.sleeps).toEqual([3000]);
    expect(h.retries).toEqual([2]);
    expect(h.logs).toContain("[Update Error] ERROR! Info request for AppID 2278520 returned error Timeout.");
    const resetLine = h.logs.find((l) => l.includes("stale SteamCMD cache"));
    expect(resetLine).toMatch(/exit 8/);
    expect(resetLine).toMatch(/reset appcache and config\.vdf/);
    expect(resetLine).toMatch(/attempt 2\/3/);
  });

  it("cold-cache 'Missing configuration' (the old install-only retry) still retries — and now resets too", async () => {
    const h = harness([
      { stdout: ["ERROR! Failed to install app '2278520' (Missing configuration)"], code: 8 },
      OK_RUN,
    ]);
    const res = await runSteamAppUpdate(h.base, h.deps);
    expect(res.attempts).toBe(2);
    expect(res.cacheReset).toBe(true);
  });

  it("fatal failures stop immediately: no reset, no sleep, no steamstat hint", async () => {
    const h = harness([{ stdout: ["ERROR! Failed to install app '2278520' (No subscription)"], code: 1 }]);
    const err = await runSteamAppUpdate(h.base, h.deps).catch((e) => e);
    expect(err).toBeInstanceOf(SteamAppUpdateError);
    expect(err.failureClass).toBe("fatal");
    expect(err.attempts).toBe(1);
    expect(err.cacheReset).toBe(false);
    expect(err.message).toContain("No subscription");
    expect(err.message).not.toContain("steamstat");
    expect(h.spawn.calls).toHaveLength(1);
    expect(h.cache.removed).toEqual([]);
    expect(h.sleeps).toEqual([]);
  });

  it("gives up after 3 attempts with a hint that the cache was already reset", async () => {
    const h = harness([TIMEOUT_RUN]);
    const err = await runSteamAppUpdate(h.base, h.deps).catch((e) => e);
    expect(err).toBeInstanceOf(SteamAppUpdateError);
    expect(err.attempts).toBe(3);
    expect(err.code).toBe(8);
    expect(err.cacheReset).toBe(true);
    expect(h.spawn.calls).toHaveLength(3);
    expect(h.cache.removed).toEqual([APPCACHE, CONFIG_VDF]); // reset exactly once
    expect(h.sleeps).toEqual([3000, 10000]);
    expect(h.retries).toEqual([2, 3]);
    expect(err.message).toMatch(/exited with code 8 after 3 attempts/);
    expect(err.message).toContain("returned error Timeout");
    expect(err.message).toContain("already reset automatically");
    expect(err.message).toContain("steamstat.us");
  });

  it("transient failures retry with backoff but leave the cache alone", async () => {
    const h = harness([{ stdout: ["ERROR! Something odd"], code: 3 }, OK_RUN]);
    const res = await runSteamAppUpdate(h.base, h.deps);
    expect(res).toEqual({ attempts: 2, alreadyUpToDate: false, cacheReset: false });
    expect(h.cache.removed).toEqual([]);
    expect(h.sleeps).toEqual([3000]);
    expect(h.logs.some((l) => /Attempt 1\/3 failed \(exit 3: ERROR! Something odd\)\. Retrying in 3s/.test(l))).toBe(true);
  });

  it("reports 'already up to date' so the update window can tell no-op from install", async () => {
    const h = harness([{ stdout: ["Success! App '2278520' already up to date."], code: 0 }]);
    const res = await runSteamAppUpdate({ ...h.base, tags: { error: "[SteamCMD Error]" } }, h.deps);
    expect(res.alreadyUpToDate).toBe(true);
    // No status tag → quiet about progress/success lines.
    expect(h.logs).toEqual([]);
  });

  it("successCheck turns a non-zero exit into success (install: the executable landed)", async () => {
    const h = harness([{ stdout: [], code: 8 }]);
    const res = await runSteamAppUpdate({ ...h.base, successCheck: () => true }, h.deps);
    expect(res).toEqual({ attempts: 1, alreadyUpToDate: false, cacheReset: false });
    expect(h.cache.removed).toEqual([]);
  });

  it("a spawn failure is fatal on the spot", async () => {
    const h = harness([{ spawnError: "spawn steamcmd.exe ENOENT" }]);
    const err = await runSteamAppUpdate(h.base, h.deps).catch((e) => e);
    expect(err).toBeInstanceOf(SteamAppUpdateError);
    expect(err.failureClass).toBe("fatal");
    expect(err.attempts).toBe(1);
    expect(err.message).toBe("SteamCMD failed to start: spawn steamcmd.exe ENOENT");
    expect(h.spawn.calls).toHaveLength(1);
  });

  it("stderr lines are surfaced and used as the detail when stdout had none", async () => {
    const h = harness([{ stderr: ["src/clientdll/steamengine.cpp (1234) : Assertion Failed"], code: 42 }, OK_RUN]);
    await runSteamAppUpdate(h.base, h.deps);
    expect(h.logs).toContain("[SteamCMD] src/clientdll/steamengine.cpp (1234) : Assertion Failed");
    expect(h.logs.some((l) => l.includes("exit 42: src/clientdll/steamengine.cpp"))).toBe(true);
  });

  it("maxAttempts 1 never retries, and the hint doesn't claim a reset happened", async () => {
    const h = harness([TIMEOUT_RUN]);
    const err = await runSteamAppUpdate({ ...h.base, maxAttempts: 1 }, h.deps).catch((e) => e);
    expect(err.attempts).toBe(1);
    expect(err.cacheReset).toBe(false);
    expect(h.cache.removed).toEqual([]);
    expect(err.message).not.toContain("after 1 attempts");
    expect(err.message).not.toContain("already reset");
    expect(err.message).toContain("steamstat.us");
  });

  it("uses a real timer by default (sleep dep is optional)", async () => {
    const spawn = fakeSpawn([{ stdout: ["ERROR! odd"], code: 3 }, OK_RUN]);
    const cache = fakeCache([]);
    const started = Date.now();
    const res = await runSteamAppUpdate(
      { ...harness([]).base, backoffMs: [20] },
      { spawnImpl: spawn.spawnImpl, exists: cache.exists, remove: cache.remove }
    );
    expect(res.attempts).toBe(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });
});
