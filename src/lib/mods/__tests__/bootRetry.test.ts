import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { testServerBootWithQuarantine, quarantineFromStartCrash } from "../bootRetry";
import { SandboxBootError } from "@/lib/runners/sandbox";
import { fetchLoaderBuild } from "@/lib/mods/curseforge";

// testServerBoot is THE boundary here — the sandbox spawns real processes.
let bootBehavior: () => void = () => {};
vi.mock("@/lib/runners/sandbox", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/runners/sandbox")>()),
  testServerBoot: async () => {
    bootBehavior();
  },
}));

// Version-range bumps resolve against CurseForge; the fixture store decides
// which projects ship a replacement build.
const cfBag = vi.hoisted(() => ({ builds: new Map<number, { id: number; displayName?: string; fileName?: string } | null>() }));
vi.mock("@/lib/mods/curseforge", () => ({
  fetchLoaderBuild: vi.fn(async (modId: number) => cfBag.builds.get(modId) ?? null),
  curseForgeDownloadUrl: (f: { id: number }) => `cf://files/${f.id}`,
}));
vi.mock("@/lib/download", () => ({
  downloadFile: vi.fn(async (_url: string, dest: string) => {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile(
      "META-INF/neoforge.mods.toml",
      Buffer.from('[[mods]]\nmodId="modern_industrialization"\nversion="2.5.11"\n')
    );
    zip.writeZip(dest);
  }),
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
    vi.mocked(fetchLoaderBuild).mockClear();
    cfBag.builds.clear();
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

  it("quarantines every 'not a valid mod file' jar in one round, even with no Mod file line", async () => {
    for (const id of ["322506", "385587", "431203", "627557"]) {
      makeJar(path.join(serverRoot, "mods"), `${id}.jar`, {}); // shader packs: valid zips, no manifest
    }
    makeJar(path.join(serverRoot, "mods"), "darkmode-1.0.jar", { modId: "darkmodeeverywhere" });
    // The shape of the live 2026-10-27 crash: invalid-file entries carry no
    // "Mod file:" line, only a "Failure message: File …jar is not a valid mod file".
    fs.writeFileSync(
      path.join(serverRoot, "crash-reports", "crash-2026-10-27_00.00.00-fml.txt"),
      "-- Mod loading issue --\n\tMod file: <No mod information provided>\n\tFailure message: File C:\\data\\mods\\322506.jar is not a valid mod file\n" +
        "-- Mod loading issue --\n\tMod file: <No mod information provided>\n\tFailure message: File C:\\data\\mods\\385587.jar is not a valid mod file\n" +
        "-- Mod loading issue for: darkmodeeverywhere --\n\tMod file: mods/darkmode-1.0.jar\n\tFailure message: invalid dist DEDICATED_SERVER\n"
    );

    let calls = 0;
    bootBehavior = () => {
      calls++;
      if (calls === 1) throw new SandboxBootError("crashed", "");
    };

    const removed = await testServerBootWithQuarantine({
      serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings,
    });
    expect(removed.sort()).toEqual([
      "322506.jar", "385587.jar", "431203.jar", "627557.jar", "darkmode-1.0.jar",
    ]);
    expect(calls).toBe(2); // one quarantine round cleared all five
  });

  it("quarantines a mod FML blames for a missing language provider", async () => {
    makeJar(path.join(serverRoot, "mods"), "282837.jar", { modId: "scalamod" });
    makeJar(path.join(serverRoot, "mods"), "plain-1.0.jar", { modId: "plain" });
    fs.writeFileSync(
      path.join(serverRoot, "crash-reports", "crash-2026-10-27_00.00.00-fml.txt"),
      "-- MOD loading --\n\tMod File C:\\data\\mods\\282837.jar needs language provider kotori_scala:3.3.1 or above, 1 or above to load\n"
    );
    let calls = 0;
    bootBehavior = () => {
      calls++;
      if (calls === 1) throw new SandboxBootError("crashed", "");
    };

    const removed = await testServerBootWithQuarantine({
      serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings,
    });
    expect(removed).toEqual(["282837.jar"]);
    expect(calls).toBe(2);
  });

  it("bumps an out-of-range dependency from the same project and boots", async () => {
    makeJar(path.join(serverRoot, "mods"), "1067672.jar", { modId: "tesseract_api", requiredDeps: ["modern_industrialization"] });
    makeJar(path.join(serverRoot, "mods"), "405388.jar", { modId: "modern_industrialization" });
    fs.writeFileSync(
      path.join(serverRoot, "realmswap-loader.json"),
      JSON.stringify({ type: "neoforge", loaderVersion: "21.1.259", minecraftVersion: "1.21.1" })
    );
    fs.writeFileSync(
      path.join(serverRoot, "crash-reports", "crash-2026-10-27_00.00.00-fml.txt"),
      "Error during pre-loading phase: Mod tesseract_api only supports modern_industrialization 2.5.11- or above, and below 2.6-\n"
    );
    cfBag.builds.set(405388, { id: 9273385, displayName: "Modern Industrialization v2.5.11" });

    let calls = 0;
    bootBehavior = () => {
      calls++;
      if (calls === 1) throw new SandboxBootError("crashed", "");
    };

    const removed = await testServerBootWithQuarantine({
      serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings,
    });
    expect(removed).toEqual([]);
    expect(calls).toBe(2);
    expect(vi.mocked(fetchLoaderBuild)).toHaveBeenCalledWith(405388, "1.21.1", "neoforge");
    expect(fs.existsSync(path.join(serverRoot, "mods", "405388.jar"))).toBe(true); // replaced, not removed
    expect(warnings.join(" ")).toMatch(/Upgraded 'modern_industrialization'/);
    expect(warnings.join(" ")).not.toMatch(/Excluded '405388/);
  });

  it("quarantines the demanding mod when a bumped dependency still fails the range", async () => {
    makeJar(path.join(serverRoot, "mods"), "1067672.jar", { modId: "tesseract_api", requiredDeps: ["modern_industrialization"] });
    makeJar(path.join(serverRoot, "mods"), "405388.jar", { modId: "modern_industrialization" });
    fs.writeFileSync(
      path.join(serverRoot, "realmswap-loader.json"),
      JSON.stringify({ type: "neoforge", loaderVersion: "21.1.259", minecraftVersion: "1.21.1" })
    );
    fs.writeFileSync(
      path.join(serverRoot, "crash-reports", "crash-2026-10-27_00.00.00-fml.txt"),
      "Error during pre-loading phase: Mod tesseract_api only supports modern_industrialization 2.5.11- or above, and below 2.6-\n"
    );
    cfBag.builds.set(405388, { id: 9273385, displayName: "Modern Industrialization v2.5.11" });

    let calls = 0;
    bootBehavior = () => {
      calls++;
      if (calls <= 2) throw new SandboxBootError("crashed", "");
    };

    const removed = await testServerBootWithQuarantine({
      serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings,
    });
    // One bump attempt, then the mod imposing the range is dropped.
    expect(vi.mocked(fetchLoaderBuild)).toHaveBeenCalledTimes(1);
    expect(removed).toEqual(["1067672.jar"]);
    expect(fs.existsSync(path.join(serverRoot, "mods", "1067672.jar"))).toBe(false);
    expect(fs.existsSync(path.join(serverRoot, "mods", "405388.jar"))).toBe(true);
    expect(calls).toBe(3);
  });

  it("rethrows when the crash names no jar", async () => {    makeJar(path.join(serverRoot, "mods"), "sodium-1.0.jar", { modId: "sodium" });
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
        testServerBootWithQuarantine({
          serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings,
          deps: { deleteDelaysMs: [5, 5, 5] },
        })
      ).rejects.toThrow(/exit code -1/);
    } finally {
      fs.chmodSync(path.join(serverRoot, "mods"), 0o755);
    }
    expect(calls).toBe(1); // no retry boot — it would crash identically
    expect(fs.existsSync(path.join(serverRoot, "mods", "locked-1.0.jar"))).toBe(true);
    expect(warnings.join(" ")).toMatch(/Could not remove 'locked-1\.0\.jar'/);
    expect(warnings.join(" ")).toMatch(/Boot test: running on/); // the ran-vs-skipped fact
  });

  it("keeps retrying a locked jar until the lock clears, then boots again", async () => {
    makeJar(path.join(serverRoot, "mods"), "sticky-1.0.jar", { modId: "sticky" });
    writeCrashReport("mods/sticky-1.0.jar");
    let calls = 0;
    bootBehavior = () => {
      calls++;
      if (calls === 1) throw new SandboxBootError("crashed", "");
    };
    const realRm = fs.rmSync.bind(fs);
    let failures = 0;
    const rmSpy = vi.spyOn(fs, "rmSync").mockImplementation(((p: fs.PathLike, opts?: fs.RmOptions) => {
      if (String(p).endsWith("sticky-1.0.jar") && failures < 2) {
        failures++;
        throw Object.assign(new Error("EBUSY: resource busy"), { code: "EBUSY" });
      }
      return realRm(p, opts);
    }) as typeof fs.rmSync);
    try {
      const removed = await testServerBootWithQuarantine({
        serverId: path.basename(serverRoot), serverRoot, game: "MINECRAFT", warnings,
        deps: { deleteDelaysMs: [5, 5, 5] },
      });
      expect(removed).toEqual(["sticky-1.0.jar"]);
      expect(failures).toBe(2); // the lock cleared on the third attempt
      expect(calls).toBe(2); // and the retry boot ran
    } finally {
      rmSpy.mockRestore();
    }
  });
});

describe("quarantineFromStartCrash", () => {
  let dataDir = "";
  let serverRoot = "";

  beforeAll(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "startcrash-"));
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
  });

  function writeReport(body: string, ageMs = 0) {
    const p = path.join(serverRoot, "crash-reports", "crash-2026-10-27_00.00.00-fml.txt");
    fs.writeFileSync(p, body);
    if (ageMs > 0) {
      const past = new Date(Date.now() - ageMs);
      fs.utimesSync(p, past, past);
    }
  }

  it("moves the blamed client-only jar plus required dependents out of mods/ on dist evidence", async () => {
    makeJar(path.join(serverRoot, "mods"), "dme-1.0.jar", { modId: "darkmodeeverywhere" });
    makeJar(path.join(serverRoot, "mods"), "needs-dme-1.0.jar", { modId: "needsdme", requiredDeps: ["darkmodeeverywhere"] });
    makeJar(path.join(serverRoot, "mods"), "unrelated-1.0.jar", { modId: "unrelated" });
    writeReport("-- Mod loading issue for: dme --\n\tMod file: mods/dme-1.0.jar\n\tinvalid dist DEDICATED_SERVER\n");

    const { removed, warnings, quarantineDir } = await quarantineFromStartCrash({ serverRoot, deps: { renameDelaysMs: [5, 5] } });
    expect(removed.sort()).toEqual(["dme-1.0.jar", "needs-dme-1.0.jar"]);
    expect(fs.existsSync(path.join(serverRoot, "mods", "unrelated-1.0.jar"))).toBe(true);
    expect(fs.existsSync(path.join(serverRoot, "mods", "dme-1.0.jar"))).toBe(false);
    expect(fs.existsSync(path.join(quarantineDir!, "dme-1.0.jar"))).toBe(true);
    expect(warnings.join(" ")).toContain("Moved");
  });

  it("leaves mods alone when the crash names a jar without client-only evidence", async () => {
    makeJar(path.join(serverRoot, "mods"), "servermod-1.0.jar", { modId: "servermod" });
    writeReport("-- Mod loading issue for: servermod --\n\tMod file: mods/servermod-1.0.jar\n\tFailure: NullPointer\n");

    const { removed } = await quarantineFromStartCrash({ serverRoot });
    expect(removed).toEqual([]);
    expect(fs.existsSync(path.join(serverRoot, "mods", "servermod-1.0.jar"))).toBe(true);
  });

  it("ignores a stale crash report left by an earlier crash", async () => {
    makeJar(path.join(serverRoot, "mods"), "dme-1.0.jar", { modId: "darkmodeeverywhere" });
    writeReport("-- Mod loading issue --\n\tMod file: mods/dme-1.0.jar\n\tinvalid dist DEDICATED_SERVER\n", 10 * 60 * 1000);

    const { removed } = await quarantineFromStartCrash({ serverRoot });
    expect(removed).toEqual([]);
    expect(fs.existsSync(path.join(serverRoot, "mods", "dme-1.0.jar"))).toBe(true);
  });

  it("acts on an earlywindow jar even when the report text has no dist error", async () => {
    const zip = new AdmZip();
    zip.addFile("META-INF/services/net.neoforged.neoforgespi.earlywindow.ImmediateWindowProvider", Buffer.from("x"));
    zip.writeZip(path.join(serverRoot, "mods", "earlywindow-1.0.jar"));
    writeReport("-- Mod loading issue --\n\tMod file: mods/earlywindow-1.0.jar\n\tClassNotFoundException: org.lwjgl.Version\n");

    const { removed } = await quarantineFromStartCrash({ serverRoot });
    expect(removed).toEqual(["earlywindow-1.0.jar"]);
  });

  it("moves 'not a valid mod file' jars out of mods/ even without dist evidence", async () => {
    makeJar(path.join(serverRoot, "mods"), "322506.jar", {}); // manifest-less shader pack
    makeJar(path.join(serverRoot, "mods"), "broken-1.0.jar", { modId: "brokenmod" }); // manifest present, FML still rejects
    makeJar(path.join(serverRoot, "mods"), "servermod-1.0.jar", { modId: "servermod" });
    writeReport(
      "-- Mod loading issue --\n\tMod file: <No mod information provided>\n\tFailure message: File C:\\data\\mods\\322506.jar is not a valid mod file\n" +
        "-- Mod loading issue --\n\tMod file: <No mod information provided>\n\tFailure message: File C:\\data\\mods\\broken-1.0.jar is not a valid mod file\n"
    );

    const { removed, quarantineDir } = await quarantineFromStartCrash({ serverRoot, deps: { renameDelaysMs: [5, 5] } });
    expect(removed.sort()).toEqual(["322506.jar", "broken-1.0.jar"]);
    expect(fs.existsSync(path.join(quarantineDir!, "322506.jar"))).toBe(true);
    expect(fs.existsSync(path.join(serverRoot, "mods", "servermod-1.0.jar"))).toBe(true);
  });

  it("moves cross-loader jars ('is a Fabric mod and cannot be loaded') out of mods/", async () => {
    const zip = new AdmZip();
    zip.addFile("fabric.mod.json", Buffer.from('{"id":"fabricmod","version":"1.0"}'));
    zip.writeZip(path.join(serverRoot, "mods", "500525.jar"));
    makeJar(path.join(serverRoot, "mods"), "servermod-1.0.jar", { modId: "servermod" });
    fs.writeFileSync(path.join(serverRoot, "realmswap-loader.json"), JSON.stringify({ type: "neoforge", loaderVersion: "21.1.259", minecraftVersion: "1.21.1" }));
    writeReport("-- Mod loading issue --\n\tMod file: <No mod information provided>\n\tFailure message: File C:\\data\\mods\\500525.jar is a Fabric mod and cannot be loaded\n");

    const { removed, quarantineDir } = await quarantineFromStartCrash({ serverRoot, deps: { renameDelaysMs: [5, 5] } });
    expect(removed).toEqual(["500525.jar"]);
    expect(fs.existsSync(path.join(quarantineDir!, "500525.jar"))).toBe(true);
    expect(fs.existsSync(path.join(serverRoot, "mods", "servermod-1.0.jar"))).toBe(true);
  });

  it("restores everything when one jar in the closure is locked (all-or-nothing)", async () => {
    makeJar(path.join(serverRoot, "mods"), "dme-1.0.jar", { modId: "darkmodeeverywhere" });
    makeJar(path.join(serverRoot, "mods"), "needs-dme-1.0.jar", { modId: "needsdme", requiredDeps: ["darkmodeeverywhere"] });
    writeReport("-- Mod loading issue --\n\tMod file: mods/dme-1.0.jar\n\tinvalid dist DEDICATED_SERVER\n");

    const realRename = fs.renameSync.bind(fs);
    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      if (String(to).includes("needs-dme-1.0.jar")) throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
      return realRename(from, to);
    }) as typeof fs.renameSync);
    try {
      const { removed, warnings } = await quarantineFromStartCrash({ serverRoot, deps: { renameDelaysMs: [5, 5] } });
      expect(removed).toEqual([]);
      expect(fs.existsSync(path.join(serverRoot, "mods", "dme-1.0.jar"))).toBe(true);
      expect(fs.existsSync(path.join(serverRoot, "mods", "needs-dme-1.0.jar"))).toBe(true);
      expect(warnings.join(" ")).toContain("Could not move");
    } finally {
      renameSpy.mockRestore();
    }
  });
});
