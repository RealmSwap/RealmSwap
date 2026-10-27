import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { testServerBootWithQuarantine } from "../bootRetry";
import { SandboxBootError } from "@/lib/runners/sandbox";

// testServerBoot is THE boundary here — the sandbox spawns real processes.
let bootBehavior: () => void = () => {};
vi.mock("@/lib/runners/sandbox", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/runners/sandbox")>()),
  testServerBoot: async () => {
    bootBehavior();
  },
}));

vi.mock("@/lib/appPaths", () => ({
  dataRoot: () => process.env.GAMEVAULT_DATA_DIR ?? process.cwd(),
}));

function makeJar(dir: string, name: string, opts: { modId?: string; requiredDeps?: string[] }) {
  const zip = new AdmZip();
  if (opts.modId) {
    let toml = `[[mods]]\nmodId="${opts.modId}"\n`;
    for (const dep of opts.requiredDeps ?? []) {
      toml += `\n[[dependencies.${opts.modId}]]\nmodId="${dep}"\ntype="required"\n`;
    }
    zip.addFile("META-INF/neoforge.mods.toml", Buffer.from(toml));
  }
  zip.addFile("dummy.txt", Buffer.from("x"));
  zip.writeZip(path.join(dir, name));
}

describe("testServerBootWithQuarantine", () => {
  let dataDir = "";
  let serverRoot = "";

  beforeAll(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bootretry-"));
    process.env.GAMEVAULT_DATA_DIR = dataDir;
  });
  afterAll(() => {
    delete process.env.GAMEVAULT_DATA_DIR;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    serverRoot = path.join(dataDir, "local-servers", "srv" + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(path.join(serverRoot, "mods"), { recursive: true });
    fs.mkdirSync(path.join(serverRoot, "crash-reports"), { recursive: true });
    bootBehavior = () => {};
  });

  const warnings: string[] = [];

  function writeCrashReport(blamedJar: string) {
    fs.writeFileSync(
      path.join(serverRoot, "crash-reports", "crash-2026-10-27_00.00.00-fml.txt"),
      `-- Mod loading issue for: something --\n\tMod file: ${blamedJar}\n\tFailure message: client classes\n`
    );
  }

  it("quarantines the blamed jar plus required dependents and retries successfully", async () => {
    makeJar(path.join(serverRoot, "mods"), "sodium-1.0.jar", { modId: "sodium" });
    makeJar(path.join(serverRoot, "mods"), "sodium-extra-1.0.jar", { modId: "sodiumextra", requiredDeps: ["sodium"] });
    makeJar(path.join(serverRoot, "mods"), "create-1.0.jar", { modId: "create", });
    writeCrashReport("mods/sodium-1.0.jar");

    let calls = 0;
    bootBehavior = () => {
      calls++;
      if (calls === 1) throw new SandboxBootError("crashed", "");
    };

    const removed = await testServerBootWithQuarantine({
      serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings,
    });
    expect(removed.sort()).toEqual(["sodium-1.0.jar", "sodium-extra-1.0.jar"]);
    expect(fs.existsSync(path.join(serverRoot, "mods", "sodium-1.0.jar"))).toBe(false);
    expect(fs.existsSync(path.join(serverRoot, "mods", "create-1.0.jar"))).toBe(true);
    expect(warnings.join(" ")).toMatch(/Excluded 'sodium-1\.0\.jar'/);
    expect(warnings.join(" ")).toMatch(/requires sodium/);
  });

  it("rethrows when the crash names no jar", async () => {
    makeJar(path.join(serverRoot, "mods"), "sodium-1.0.jar", { modId: "sodium" });
    bootBehavior = () => {
      throw new SandboxBootError("Server crashed immediately with exit code 1.", "no mod names here");
    };
    await expect(
      testServerBootWithQuarantine({ serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings })
    ).rejects.toThrow(/exit code 1/);
    expect(fs.existsSync(path.join(serverRoot, "mods", "sodium-1.0.jar"))).toBe(true);
  });

  it("gives up after the retry cap when every round fails on a new offender", async () => {
    const offenders = ["a", "b", "c", "d"];
    offenders.forEach((m, i) => makeJar(path.join(serverRoot, "mods"), `${m}-1.0.jar`, { modId: m }));
    let round = 0;
    bootBehavior = () => {
      const m = offenders[round];
      round++;
      fs.writeFileSync(
        path.join(serverRoot, "crash-reports", `crash-${round}.txt`),
        `-- Mod loading issue for: x --\n\tMod file: mods/${m}-1.0.jar\n`
      );
      throw new SandboxBootError("crashed", "");
    };
    await expect(
      testServerBootWithQuarantine({ serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings })
    ).rejects.toThrow(/crashed/);
    expect(round).toBe(4); // initial + 3 quarantine rounds
  });

  const posixOnly = process.platform === "win32" ? it.skip : it;

  posixOnly("surfaces an undeletable jar instead of looping into identical crashes", async () => {
    makeJar(path.join(serverRoot, "mods"), "locked-1.0.jar", { modId: "locked" });
    writeCrashReport("mods/locked-1.0.jar");
    let calls = 0;
    bootBehavior = () => {
      calls++;
      throw new SandboxBootError("Server crashed immediately with exit code -1.", "");
    };
    // A read-only mods dir makes every unlink EACCES — the stand-in for
    // Windows AV/process locks, which the delete retry can't clear either.
    fs.chmodSync(path.join(serverRoot, "mods"), 0o555);
    try {
      await expect(
        testServerBootWithQuarantine({ serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings })
      ).rejects.toThrow(/exit code -1/);
    } finally {
      fs.chmodSync(path.join(serverRoot, "mods"), 0o755);
    }
    expect(calls).toBe(1); // no retry boot — it would crash identically
    expect(fs.existsSync(path.join(serverRoot, "mods", "locked-1.0.jar"))).toBe(true);
    expect(warnings.join(" ")).toMatch(/Could not remove 'locked-1\.0\.jar'/);
  });
});
