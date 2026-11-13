import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  parseVdf,
  libraryPathsFromVdf,
  readInstallDirFromManifest,
  steamAppIdForGame,
  steamLaunchCommand,
  steamRootCandidates,
  findSteamGameDir,
} from "../steamDiscovery";

describe("parseVdf", () => {
  it("parses nested nodes and quoted values", () => {
    const doc = parseVdf(`
      "libraryfolders"
      {
        "0"
        {
          "path"  "C:\\\\Program Files (x86)\\\\Steam"
          "apps"
          {
            "892970"  "Valheim"
          }
        }
      }
    `);
    expect(doc["libraryfolders"]).toBeTruthy();
    const zero = doc["libraryfolders"] as Record<string, unknown>;
    const zeroNode = zero["0"] as Record<string, unknown>;
    // Escaped backslashes come back unescaped (single \ in the actual string)
    expect(zeroNode["path"]).toBe("C:\\Program Files (x86)\\Steam");
    const apps = zeroNode["apps"] as Record<string, unknown>;
    expect(apps["892970"]).toBe("Valheim");
  });

  it("ignores // comments and blank lines", () => {
    const doc = parseVdf(`"a" // trailing comment\n{\n  "b" "c"\n}`);
    expect(doc["a"]).toEqual({ b: "c" });
  });

  it("supports bare (unquoted) tokens", () => {
    const doc = parseVdf(`root { key value }`);
    expect(doc["root"]).toEqual({ key: "value" });
  });
});

describe("libraryPathsFromVdf", () => {
  it("collects path values from the modern format", () => {
    const vdf = `
      "libraryfolders"
      {
        "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" }
        "1" { "path" "D:\\\\SteamLibrary" }
      }
    `;
    expect(libraryPathsFromVdf(vdf)).toEqual([
      "C:\\Program Files (x86)\\Steam",
      "D:\\SteamLibrary",
    ]);
  });

  it("supports the legacy flat format where numeric keys map to paths", () => {
    const vdf = `"LibraryFolders" { "TimeNextStatsReport" "1234" "1" "E:\\\\SteamLibrary2" }`;
    expect(libraryPathsFromVdf(vdf)).toEqual(["E:\\SteamLibrary2"]);
  });

  it("dedupes case- and separator-insensitively", () => {
    const vdf = `
      "libraryfolders"
      {
        "0" { "path" "C:\\\\Steam" }
        "1" { "path" "c:\\\\steam\\\\" }
      }
    `;
    expect(libraryPathsFromVdf(vdf)).toEqual(["C:\\Steam"]);
  });
});

describe("steamAppIdForGame / steamLaunchCommand", () => {
  it("maps slugs and display names to client appIds", () => {
    expect(steamAppIdForGame("VALHEIM")).toBe("892970");
    expect(steamAppIdForGame("Valheim")).toBe("892970");
    expect(steamAppIdForGame("PALWORLD")).toBe("1623730");
    expect(steamAppIdForGame("VRISING")).toBe("1604030");
    expect(steamAppIdForGame("V Rising")).toBe("1604030");
    expect(steamAppIdForGame("ZOMBOID")).toBe("108600");
    expect(steamAppIdForGame("Project Zomboid")).toBe("108600");
    expect(steamAppIdForGame("ARK")).toBe("346110");
    expect(steamAppIdForGame("ARK: Survival Evolved")).toBe("346110");
    expect(steamAppIdForGame("RUST")).toBe("252490");
    expect(steamAppIdForGame("TERRARIA")).toBe("105600");
    expect(steamAppIdForGame("SATISFACTORY")).toBe("526870");
    expect(steamAppIdForGame("ENSHROUDED")).toBe("1203620");
    expect(steamAppIdForGame("Lethal Company")).toBe("1966720");
  });

  it("returns null for non-Steam and unknown games", () => {
    expect(steamAppIdForGame("MINECRAFT")).toBeNull();
    expect(steamAppIdForGame("Windrose")).toBeNull();
    expect(steamAppIdForGame("Some Custom Game")).toBeNull();
    expect(steamAppIdForGame("")).toBeNull();
  });

  it("builds steam://run launch commands for mapped games only", () => {
    expect(steamLaunchCommand("PALWORLD")).toBe("start steam://run/1623730");
    expect(steamLaunchCommand("Valheim")).toBe("start steam://run/892970");
    expect(steamLaunchCommand("MINECRAFT")).toBeNull();
  });
});

describe("steamRootCandidates", () => {
  it("seeds from %ProgramFiles(x86)% plus the two static roots, deduped", () => {
    const roots = steamRootCandidates({
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
    });
    expect(roots).toContain(path.join("C:", "Program Files (x86)", "Steam"));
    expect(roots).toContain(path.join("D:", "SteamLibrary"));
    // env seed and static C: seed collapse into one entry
    expect(roots.filter((r) => r.toLowerCase().includes("program files (x86)")).length).toBe(1);
  });

  it("adds the env root when it differs from the static one", () => {
    const roots = steamRootCandidates({
      "ProgramFiles(x86)": "E:\\Programme (x86)",
    });
    expect(roots[0]).toBe(path.join("E:", "Programme (x86)", "Steam"));
  });
});

describe("findSteamGameDir", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "steamdisc-")));
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeLibrary(name: string, opts?: { vdf?: string; manifest?: { appId: string; installdir: string } }) {
    const lib = path.join(tmpRoot, name);
    fs.mkdirSync(path.join(lib, "steamapps", "common"), { recursive: true });
    if (opts?.vdf !== undefined) {
      fs.writeFileSync(path.join(lib, "steamapps", "libraryfolders.vdf"), opts.vdf);
    }
    if (opts?.manifest) {
      fs.writeFileSync(
        path.join(lib, "steamapps", `appmanifest_${opts.manifest.appId}.acf`),
        `"AppState"\n{\n  "appid"  "${opts.manifest.appId}"\n  "installdir"  "${opts.manifest.installdir}"\n}`
      );
    }
    return lib;
  }

  it("resolves via appmanifest installdir (authoritative)", () => {
    const lib = makeLibrary("lib-manifest", {
      manifest: { appId: "1623730", installdir: "Palworld" },
    });
    const gameDir = path.join(lib, "steamapps", "common", "Palworld");
    fs.mkdirSync(gameDir, { recursive: true });

    expect(findSteamGameDir("PALWORLD", { roots: [lib] })).toBe(gameDir);
  });

  it("falls back to folder-name guessing when the appmanifest is missing", () => {
    const lib = makeLibrary("lib-guess");
    const gameDir = path.join(lib, "steamapps", "common", "Valheim");
    fs.mkdirSync(gameDir, { recursive: true });

    expect(findSteamGameDir("VALHEIM", { roots: [lib] })).toBe(gameDir);
  });

  it("follows libraryfolders.vdf to libraries outside the seed roots", () => {
    const seed = makeLibrary("lib-seed", {
      vdf: `"libraryfolders"\n{\n  "1" { "path" "${path
        .join(tmpRoot, "lib-remote")
        .replace(/\\/g, "\\\\\\\\")}" }\n}`,
    });
    const remote = makeLibrary("lib-remote", {
      manifest: { appId: "108600", installdir: "Zomboid" },
    });
    const gameDir = path.join(remote, "steamapps", "common", "Zomboid");
    fs.mkdirSync(gameDir, { recursive: true });

    expect(findSteamGameDir("ZOMBOID", { roots: [seed] })).toBe(gameDir);
  });

  it("keeps scanning when a manifest exists but its install dir does not", () => {
    const broken = makeLibrary("lib-broken", {
      manifest: { appId: "1604030", installdir: "V Rising" }, // dir never created
    });
    const good = makeLibrary("lib-good");
    const gameDir = path.join(good, "steamapps", "common", "V Rising");
    fs.mkdirSync(gameDir, { recursive: true });

    expect(findSteamGameDir("V Rising", { roots: [broken, good] })).toBe(gameDir);
  });

  it("returns null when nothing matches", () => {
    const lib = makeLibrary("lib-empty");
    expect(findSteamGameDir("PALWORLD", { roots: [lib] })).toBeNull();
    expect(findSteamGameDir("MINECRAFT", { roots: [lib] })).toBeNull();
  });
});

describe("readInstallDirFromManifest", () => {
  it("reads installdir and returns null for missing files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acf-"));
    try {
      const manifest = path.join(dir, "appmanifest_892970.acf");
      fs.writeFileSync(
        manifest,
        `"AppState" { "Universe" "1" "installdir" "Valheim" "StateFlags" "4" }`
      );
      expect(readInstallDirFromManifest(manifest)).toBe("Valheim");
      expect(readInstallDirFromManifest(path.join(dir, "missing.acf"))).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
