import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import {
  detectModLoader, detectMinecraftVersion, readLoaderMarker, writeLoaderMarker,
  javaMajorForMinecraft, pickForgeVersion, forgeArtifact, forgeInstallerUrl,
  neoforgeStreamFor, pickNeoforgeVersion, neoforgeInstallerUrl,
  applyLoaderLaunch, findLoaderLaunch, installForgeServer, installNeoForgeServer,
  installQuiltServer,
} from "../mcLoaders";
import {
  pickCompatibleVersion, primaryFile, collectRequiredDependencies,
  type ModrinthVersion,
} from "../modrinth";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mods-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function makeJar(name: string, entries: Record<string, string>): string {
  const zip = new AdmZip();
  for (const [entry, content] of Object.entries(entries)) zip.addFile(entry, Buffer.from(content, "utf-8"));
  const p = path.join(dir, name);
  zip.writeZip(p);
  return p;
}

describe("mcLoaders", () => {
  it("detects Fabric, Quilt, Forge, and NeoForge jars by manifest", () => {
    expect(detectModLoader(makeJar("fabric.jar", { "fabric.mod.json": "{}" }))).toBe("fabric");
    expect(detectModLoader(makeJar("quilt.jar", { "quilt.mod.json": "{}" }))).toBe("quilt");
    expect(detectModLoader(makeJar("forge.jar", { "META-INF/mods.toml": 'loader="javafml"' }))).toBe("forge");
    expect(detectModLoader(makeJar("neoforge.jar", { "META-INF/neoforge.mods.toml": 'loaderVersion="[21,)"' }))).toBe("neoforge");
    // neoforge.mods.toml wins even when a legacy mods.toml is also present
    expect(detectModLoader(makeJar("both.jar", {
      "META-INF/mods.toml": 'loader="javafml"',
      "META-INF/neoforge.mods.toml": 'loaderVersion="[21,)"',
    }))).toBe("neoforge");
  });

  it("returns null for loader-less jars", () => {
    expect(detectModLoader(makeJar("plain.jar", { "META-INF/MANIFEST.MF": "Manifest-Version: 1.0" }))).toBeNull();
  });

  it("reads the Minecraft version from server.jar's version.json", () => {
    makeJar("server.jar", { "version.json": JSON.stringify({ id: "1.20.4", name: "1.20.4" }) });
    expect(detectMinecraftVersion(dir)).toBe("1.20.4");
  });

  it("round-trips the loader marker", () => {
    expect(readLoaderMarker(dir)).toBeNull();
    writeLoaderMarker(dir, { type: "fabric", loaderVersion: "0.16.0", minecraftVersion: "1.20.4", installedAt: "now" });
    expect(readLoaderMarker(dir)).toMatchObject({ type: "fabric", loaderVersion: "0.16.0" });
  });

  it("normalizes pre-launch-field fabric markers", () => {
    fs.writeFileSync(
      path.join(dir, "realmswap-loader.json"),
      JSON.stringify({ type: "fabric", loaderVersion: "0.16.0", minecraftVersion: "1.20.4", installedAt: "old" })
    );
    expect(readLoaderMarker(dir)?.launch).toEqual({ kind: "jar", file: "fabric-server-launch.jar" });
  });
});

describe("javaMajorForMinecraft", () => {
  it("maps Minecraft versions to their Java major", () => {
    expect(javaMajorForMinecraft("1.12.2")).toBe(8);
    expect(javaMajorForMinecraft("1.16.5")).toBe(8);
    expect(javaMajorForMinecraft("1.17.1")).toBe(17);
    expect(javaMajorForMinecraft("1.20.4")).toBe(17);
    expect(javaMajorForMinecraft("1.20.5")).toBe(21);
    expect(javaMajorForMinecraft("1.20.6")).toBe(21);
    expect(javaMajorForMinecraft("1.21")).toBe(21);
    expect(javaMajorForMinecraft("1.21.4")).toBe(21);
  });

  it("fails open to a modern Java on unparseable versions", () => {
    expect(javaMajorForMinecraft("latest")).toBe(21);
    expect(javaMajorForMinecraft("")).toBe(21);
  });
});

describe("Forge version resolution", () => {
  const promos = {
    "1.20.1-recommended": "47.2.0",
    "1.20.1-latest": "47.3.0",
    "1.12.2-latest": "14.23.5.2860",
  };

  it("prefers recommended over latest and falls back to latest", () => {
    expect(pickForgeVersion(promos, "1.20.1")).toBe("47.2.0");
    expect(pickForgeVersion(promos, "1.12.2")).toBe("14.23.5.2860");
    expect(pickForgeVersion(promos, "1.19.4")).toBeNull();
  });

  it("builds the maven artifact and installer URL", () => {
    expect(forgeArtifact("1.20.1", "47.2.0")).toBe("1.20.1-47.2.0");
    expect(forgeInstallerUrl("1.20.1", "47.2.0")).toBe(
      "https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-installer.jar"
    );
    // the double-suffixed legacy form keeps working
    expect(forgeArtifact("1.7.10", "10.13.4.1614-1.7.10")).toBe("1.7.10-10.13.4.1614-1.7.10");
  });
});

describe("NeoForge version resolution", () => {
  const versions = ["20.4.237", "21.0.3", "21.1.9", "21.1.57", "21.1.60-beta"];

  it("maps Minecraft versions onto their NeoForge stream", () => {
    expect(neoforgeStreamFor("1.21.1")).toBe("21.1");
    expect(neoforgeStreamFor("1.21")).toBe("21.0");
    expect(neoforgeStreamFor("1.20.4")).toBe("20.4");
    expect(neoforgeStreamFor("2.0")).toBeNull();
  });

  it("picks the newest stable build in the stream, excluding prereleases", () => {
    expect(pickNeoforgeVersion(versions, "1.21.1")).toBe("21.1.57");
    expect(pickNeoforgeVersion(versions, "1.21")).toBe("21.0.3");
    expect(pickNeoforgeVersion(versions, "1.20.4")).toBe("20.4.237");
    expect(pickNeoforgeVersion(versions, "1.16.5")).toBeNull();
  });

  it("builds the installer URL", () => {
    expect(neoforgeInstallerUrl("21.1.57")).toBe(
      "https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.57/neoforge-21.1.57-installer.jar"
    );
  });
});

describe("applyLoaderLaunch", () => {
  const vanilla = ["-Xms512M", "-Xmx4G", "-jar", "server.jar", "nogui"];
  const exists = (f: string) => f.startsWith("fabric") || f.startsWith("libraries/");

  it("swaps in the loader jar for fabric markers", () => {
    const marker = { type: "fabric" as const, loaderVersion: "0.16", minecraftVersion: "1.20.4", installedAt: "", launch: { kind: "jar" as const, file: "fabric-server-launch.jar" } };
    expect(applyLoaderLaunch(vanilla, marker, exists)).toEqual([
      "-Xms512M", "-Xmx4G", "-jar", "fabric-server-launch.jar", "nogui",
    ]);
  });

  it("replaces the -jar pair with an @args file for modern forge markers", () => {
    const argsFile = "libraries/net/minecraftforge/forge/1.20.1-47.2.0/win_args.txt";
    const marker = { type: "forge" as const, loaderVersion: "47.2.0", minecraftVersion: "1.20.1", installedAt: "", launch: { kind: "argsFile" as const, file: argsFile } };
    expect(applyLoaderLaunch(vanilla, marker, exists)).toEqual([
      "-Xms512M", "-Xmx4G", `@${argsFile}`, "nogui",
    ]);
  });

  it("handles a bare server.jar without -jar", () => {
    const marker = { type: "neoforge" as const, loaderVersion: "21.1.57", minecraftVersion: "1.21.1", installedAt: "", launch: { kind: "argsFile" as const, file: "libraries/x" } };
    expect(applyLoaderLaunch(["java-arg", "server.jar"], marker, () => true)).toEqual(["java-arg", "@libraries/x"]);
  });

  it("keeps vanilla launch when the artifact is missing, the marker is absent, or there is no server.jar arg", () => {
    const marker = { type: "fabric" as const, loaderVersion: "0.16", minecraftVersion: "1.20.4", installedAt: "", launch: { kind: "jar" as const, file: "fabric-server-launch.jar" } };
    expect(applyLoaderLaunch(vanilla, marker, () => false)).toEqual(vanilla);
    expect(applyLoaderLaunch(vanilla, null, exists)).toEqual(vanilla);
    expect(applyLoaderLaunch(["-Xmx4G"], marker, exists)).toEqual(["-Xmx4G"]);
  });
});

describe("findLoaderLaunch", () => {
  it("finds modern args files (platform-named) and legacy universal jars", () => {
    const argsName = process.platform === "win32" ? "win_args.txt" : "unix_args.txt";
    const forgeLibs = path.join(dir, "find-modern", "libraries", "net", "minecraftforge", "forge", "1.20.1-47.2.0");
    fs.mkdirSync(forgeLibs, { recursive: true });
    fs.writeFileSync(path.join(forgeLibs, argsName), "-p libraries");
    const found = findLoaderLaunch("forge", path.join(dir, "find-modern"));
    expect(found).toEqual({ kind: "argsFile", file: path.join("libraries", "net", "minecraftforge", "forge", "1.20.1-47.2.0", argsName) });

    const legacyDir = path.join(dir, "find-legacy");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "forge-1.12.2-14.23.5.2860-universal.jar"), "jar");
    expect(findLoaderLaunch("forge", legacyDir)).toEqual({
      kind: "jar",
      file: "forge-1.12.2-14.23.5.2860-universal.jar",
    });
  });

  it("returns null when the installer produced nothing recognizable", () => {
    const empty = path.join(dir, "find-empty");
    fs.mkdirSync(empty, { recursive: true });
    expect(findLoaderLaunch("forge", empty)).toBeNull();
    expect(findLoaderLaunch("neoforge", empty)).toBeNull();
  });
});

describe("installer flows (dependency-injected)", () => {
  const stubDeps = (effects: {
    promos?: Record<string, string>;
    neoforgeVersions?: string[];
    onRun?: (installerPath: string) => void;
    exitCode?: number;
  } = {}) => {
    const downloads: string[] = [];
    const javaMajors: number[] = [];
    return {
      deps: {
        fetchJson: async (url: string) => {
          if (url.includes("promotions")) return { promos: effects.promos ?? { "1.20.1-recommended": "47.2.0" } };
          if (url.includes("neoforged")) return { versions: effects.neoforgeVersions ?? ["21.1.9", "21.1.57"] };
          throw new Error(`unexpected fetch: ${url}`);
        },
        download: async (_url: string, dest: string) => {
          downloads.push(path.basename(dest));
          fs.writeFileSync(dest, "installer-jar");
        },
        ensureJava: async (major: number) => {
          javaMajors.push(major);
          return `/fake/java-${major}/bin/java`;
        },
        runInstaller: async (_javaExe: string, installerPath: string, _installDir: string) => {
          effects.onRun?.(installerPath);
          if (effects.exitCode !== undefined && effects.exitCode !== 0) {
            throw new Error("Loader installer exited with code 1");
          }
        },
      },
      downloads,
      javaMajors,
    };
  };

  it("installs modern Forge end-to-end and records the args-file launch", async () => {
    const installDir = path.join(dir, "forge-modern");
    fs.mkdirSync(installDir, { recursive: true });
    const argsName = process.platform === "win32" ? "win_args.txt" : "unix_args.txt";
    const { deps, javaMajors } = stubDeps({
      onRun: () => {
        const libs = path.join(installDir, "libraries", "net", "minecraftforge", "forge", "1.20.1-47.2.0");
        fs.mkdirSync(libs, { recursive: true });
        fs.writeFileSync(path.join(libs, argsName), "-p libraries");
      },
    });
    const marker = await installForgeServer(installDir, "1.20.1", {}, deps);
    expect(marker).toMatchObject({ type: "forge", loaderVersion: "47.2.0", minecraftVersion: "1.20.1" });
    expect(marker.launch).toEqual({
      kind: "argsFile",
      file: path.join("libraries", "net", "minecraftforge", "forge", "1.20.1-47.2.0", argsName),
    });
    expect(readLoaderMarker(installDir)).toMatchObject(marker);
    expect(javaMajors).toEqual([17]); // 1.20.1 installer runs on Java 17
    expect(fs.existsSync(path.join(installDir, "forge-1.20.1-47.2.0-installer.jar"))).toBe(false); // cleaned up
  });

  it("supports legacy Forge via the universal jar and Java 8", async () => {
    const installDir = path.join(dir, "forge-legacy");
    fs.mkdirSync(installDir, { recursive: true });
    const { deps, javaMajors } = stubDeps({
      promos: { "1.12.2-latest": "14.23.5.2860" },
      onRun: () => {
        fs.writeFileSync(path.join(installDir, "forge-1.12.2-14.23.5.2860-universal.jar"), "jar");
      },
    });
    const marker = await installForgeServer(installDir, "1.12.2", {}, deps);
    expect(marker.launch).toEqual({ kind: "jar", file: "forge-1.12.2-14.23.5.2860-universal.jar" });
    expect(javaMajors).toEqual([8]);
  });

  it("uses the pack-pinned Forge version without consulting promotions", async () => {
    const installDir = path.join(dir, "forge-pinned");
    fs.mkdirSync(installDir, { recursive: true });
    const argsName = process.platform === "win32" ? "win_args.txt" : "unix_args.txt";
    let fetched = false;
    const { deps } = stubDeps({
      onRun: () => {
        const libs = path.join(installDir, "libraries", "net", "minecraftforge", "forge", "1.20.1-47.3.0");
        fs.mkdirSync(libs, { recursive: true });
        fs.writeFileSync(path.join(libs, argsName), "-p libraries");
      },
    });
    const origFetch = deps.fetchJson;
    deps.fetchJson = async (url: string) => {
      fetched = true;
      return origFetch!(url);
    };
    const marker = await installForgeServer(installDir, "1.20.1", { pinnedVersion: "47.3.0" }, deps);
    expect(marker.loaderVersion).toBe("47.3.0");
    expect(fetched).toBe(false);
  });

  it("installs NeoForge from the maven version list and records the args-file launch", async () => {
    const installDir = path.join(dir, "neoforge");
    fs.mkdirSync(installDir, { recursive: true });
    const argsName = process.platform === "win32" ? "win_args.txt" : "unix_args.txt";
    const { deps, javaMajors } = stubDeps({
      neoforgeVersions: ["21.1.9", "21.1.57", "21.1.60-beta"],
      onRun: () => {
        const libs = path.join(installDir, "libraries", "net", "neoforged", "neoforge", "21.1.57");
        fs.mkdirSync(libs, { recursive: true });
        fs.writeFileSync(path.join(libs, argsName), "-p libraries");
      },
    });
    const marker = await installNeoForgeServer(installDir, "1.21.1", {}, deps);
    expect(marker).toMatchObject({ type: "neoforge", loaderVersion: "21.1.57" });
    expect(marker.launch?.kind).toBe("argsFile");
    expect(javaMajors).toEqual([21]);
  });

  it("rolls the error up when the installer fails or produces nothing", async () => {
    const installDir = path.join(dir, "forge-fail");
    fs.mkdirSync(installDir, { recursive: true });

    const failing = stubDeps({ exitCode: 1 });
    await expect(installForgeServer(installDir, "1.20.1", {}, failing.deps)).rejects.toThrow(/exited with code 1/);

    const silent = stubDeps({}); // succeeds but writes nothing
    await expect(installForgeServer(installDir, "1.20.1", {}, silent.deps)).rejects.toThrow(/no recognizable launch files/);
  });

  it("refuses Minecraft versions with no Forge/NeoForge build", async () => {
    const installDir = path.join(dir, "forge-none");
    fs.mkdirSync(installDir, { recursive: true });
    const { deps } = stubDeps({ promos: {} });
    await expect(installForgeServer(installDir, "1.19.4", {}, deps)).rejects.toThrow(/No Forge build/);

    const noneo = stubDeps({ neoforgeVersions: ["20.4.237"] });
    await expect(installNeoForgeServer(installDir, "1.16.5", {}, noneo.deps)).rejects.toThrow(/No NeoForge build/);
  });
});

describe("Quilt installer flow (dependency-injected)", () => {
  const quiltDeps = (effects: {
    loaderVersions?: string[];
    produceLaunchJar?: boolean;
  } = {}) => {
    const argsSeen: string[][] = [];
    const javaMajors: number[] = [];
    const installDir = path.join(dir, `quilt-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(installDir, { recursive: true });
    return {
      installDir,
      argsSeen,
      javaMajors,
      deps: {
        fetchJson: async (url: string) => {
          if (url.includes("/versions/loader/")) {
            return (effects.loaderVersions ?? ["0.20.0-beta.9", "0.19.2"])
              .map((v) => ({ loader: { version: v } }));
          }
          if (url.endsWith("/versions/installer")) {
            return [{ version: "0.15.1", url: "https://maven.quiltmc.org/quilt-installer-0.15.1.jar" }];
          }
          throw new Error(`unexpected fetch: ${url}`);
        },
        download: async (_url: string, dest: string) => fs.writeFileSync(dest, "installer-jar"),
        ensureJava: async (major: number) => {
          javaMajors.push(major);
          return `/fake/java-${major}/bin/java`;
        },
        runProcess: async (_javaExe: string, args: string[], _cwd: string) => {
          argsSeen.push(args);
          if (effects.produceLaunchJar !== false) {
            fs.writeFileSync(path.join(installDir, "quilt-server-launch.jar"), "launch");
          }
        },
      },
    };
  };

  it("installs via the official installer CLI and records the jar-swap marker", async () => {
    const { installDir, deps, argsSeen, javaMajors } = quiltDeps();
    const marker = await installQuiltServer(installDir, "1.20.4", {}, deps);
    expect(marker).toMatchObject({
      type: "quilt",
      loaderVersion: "0.20.0-beta.9",
      minecraftVersion: "1.20.4",
      launch: { kind: "jar", file: "quilt-server-launch.jar" },
    });
    expect(readLoaderMarker(installDir)).toMatchObject(marker);
    expect(argsSeen[0]).toEqual([
      "-jar", "quilt-installer-0.15.1.jar",
      "install", "server", "1.20.4", "0.20.0-beta.9",
      `--install-dir=${installDir}`,
    ]);
    expect(javaMajors).toEqual([17]); // 1.20.4 needs Java 17
    expect(fs.readdirSync(installDir).filter((f) => f.startsWith("quilt-installer-"))).toEqual([]); // cleaned up
  });

  it("honors a pinned loader version and rejects one that doesn't exist", async () => {
    const pinned = quiltDeps();
    const marker = await installQuiltServer(pinned.installDir, "1.20.4", { pinnedVersion: "0.19.2" }, pinned.deps);
    expect(marker.loaderVersion).toBe("0.19.2");
    expect(pinned.argsSeen[0][5]).toBe("0.19.2");

    const bad = quiltDeps();
    await expect(
      installQuiltServer(bad.installDir, "1.20.4", { pinnedVersion: "0.99.0" }, bad.deps)
    ).rejects.toThrow(/not available/);
  });

  it("runs the installer on a modern JVM even for old Minecraft servers", async () => {
    const old = quiltDeps();
    await installQuiltServer(old.installDir, "1.16.5", {}, old.deps);
    expect(old.javaMajors).toEqual([17]);
  });

  it("fails when the installer produced no quilt-server-launch.jar", async () => {
    const silent = quiltDeps({ produceLaunchJar: false });
    await expect(installQuiltServer(silent.installDir, "1.20.4", {}, silent.deps)).rejects.toThrow(
      /no quilt-server-launch\.jar/
    );
  });

  it("refuses Minecraft versions with no Quilt loader", async () => {
    const none = quiltDeps({ loaderVersions: [] });
    await expect(installQuiltServer(none.installDir, "1.19.4", {}, none.deps)).rejects.toThrow(/No Quilt loader/);
  });
});

function version(partial: Partial<ModrinthVersion> & { id: string; project_id: string }): ModrinthVersion {
  return {
    version_number: "1.0.0",
    game_versions: [],
    loaders: [],
    dependencies: [],
    files: [{ url: `https://example.com/${partial.id}.jar`, filename: `${partial.id}.jar`, primary: true }],
    ...partial,
  } as ModrinthVersion;
}

describe("modrinth helpers", () => {
  it("picks the first version matching game version and loader", () => {
    const versions = [
      version({ id: "v3", project_id: "p", version_number: "3.0.0", game_versions: ["1.21"], loaders: ["fabric"] }),
      version({ id: "v2", project_id: "p", version_number: "2.0.0", game_versions: ["1.20.4"], loaders: ["fabric"] }),
      version({ id: "v1", project_id: "p", version_number: "1.0.0", game_versions: ["1.20.4", "1.21"], loaders: ["fabric"] }),
    ];
    expect(pickCompatibleVersion(versions, { gameVersion: "1.20.4", loader: "fabric" })?.version_number).toBe("2.0.0");
    expect(pickCompatibleVersion(versions, {})?.version_number).toBe("3.0.0"); // no constraints → newest
    expect(pickCompatibleVersion(versions, { loader: "quilt" })).toBeNull();
  });

  it("honors an exact pinned version number over compatibility order", () => {
    const versions = [
      version({ id: "v3", project_id: "p", version_number: "3.0.0", game_versions: ["1.21"], loaders: ["fabric"] }),
      version({ id: "v2", project_id: "p", version_number: "2.0.0", game_versions: ["1.20.4"], loaders: ["fabric"] }),
    ];
    // the pin wins even though a newer version matches the game version
    expect(pickCompatibleVersion(versions, { gameVersion: "1.21", versionNumber: "2.0.0" })?.version_number).toBe("2.0.0");
    // an unknown pin falls back to the newest compatible version
    expect(pickCompatibleVersion(versions, { gameVersion: "1.21", versionNumber: "9.9.9" })?.version_number).toBe("3.0.0");
  });

  it("prefers the primary file", () => {
    const v = version({ id: "v", project_id: "p", files: [
      { url: "secondary", filename: "a.jar", primary: false },
      { url: "primary", filename: "b.jar", primary: true },
    ]});
    expect(primaryFile(v)?.url).toBe("primary");
  });

  it("walks required dependencies breadth-first, skipping optional, installed, and cyclic", async () => {
    const root = version({ id: "root", project_id: "root", dependencies: [
      { project_id: "liba", dependency_type: "required" },
      { project_id: "libb", dependency_type: "optional" },        // skipped
      { project_id: "installed", dependency_type: "required" },   // already installed
    ]});
    const liba = version({ id: "va", project_id: "liba", dependencies: [
      { project_id: "deep", dependency_type: "required" },
      { project_id: "root", dependency_type: "required" },        // cycle
    ]});
    const deep = version({ id: "vd", project_id: "deep" });

    const lookup = (id: string) => ({ root, liba, deep, installed: version({ id: "vi", project_id: "installed" }) })[id] ?? null;
    const { order, missingProjects } = await collectRequiredDependencies(root, lookup, (id) => id === "installed");

    expect(order.map((v) => v.project_id)).toEqual(["liba", "deep"]); // deps before deeper deps
    expect(missingProjects).toEqual([]);
  });

  it("records unresolvable dependencies instead of failing", async () => {
    const root = version({ id: "r", project_id: "r", dependencies: [{ project_id: "ghost", dependency_type: "required" }] });
    const { order, missingProjects } = await collectRequiredDependencies(root, () => null, () => false);
    expect(order).toEqual([]);
    expect(missingProjects).toEqual(["ghost"]);
  });

  it("accepts an async lookup (fetch + compatibility pick)", async () => {
    const root = version({ id: "r", project_id: "r", dependencies: [{ project_id: "liba", dependency_type: "required" }] });
    const liba = version({ id: "va", project_id: "liba" });
    const { order } = await collectRequiredDependencies(root, async (id) => (id === "liba" ? liba : null), () => false);
    expect(order.map((v) => v.project_id)).toEqual(["liba"]);
  });
});
