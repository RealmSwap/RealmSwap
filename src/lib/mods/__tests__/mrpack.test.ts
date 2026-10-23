import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import AdmZip from "adm-zip";
import {
  readMrpackIndex, safePackPath, selectServerFiles, verifyFileHash,
  extractMrpackOverrides, loaderRequirement, type MrpackIndex,
} from "../mrpack";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mrpack-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function digest(algo: string, buf: Buffer): string {
  return crypto.createHash(algo).update(buf).digest("hex");
}

function makeMrpack(index: Partial<MrpackIndex>, archiveFiles: Record<string, string> = {}): AdmZip {
  const zip = new AdmZip();
  zip.addFile(
    "modrinth.index.json",
    Buffer.from(JSON.stringify({
      formatVersion: 1,
      game: "minecraft",
      versionId: "1.0.0",
      name: "Test Pack",
      dependencies: { minecraft: "1.20.4" },
      files: [],
      ...index,
    }))
  );
  for (const [name, content] of Object.entries(archiveFiles)) zip.addFile(name, Buffer.from(content, "utf-8"));
  return zip;
}

const fabricDeps = { minecraft: "1.20.4", "fabric-loader": "0.15.7" };

describe("readMrpackIndex", () => {
  it("parses a valid index", () => {
    const index = readMrpackIndex(makeMrpack({ name: "My Pack", dependencies: fabricDeps }));
    expect(index.name).toBe("My Pack");
    expect(index.files).toEqual([]);
  });

  it("refuses CurseForge packs with a pointer to the Modrinth format", () => {
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from("{}"));
    expect(() => readMrpackIndex(zip)).toThrow(/CurseForge/);
  });

  it("refuses archives without an index", () => {
    expect(() => readMrpackIndex(new AdmZip())).toThrow(/modrinth\.index\.json/);
  });

  it("refuses unsupported format versions and non-Minecraft games", () => {
    expect(() => readMrpackIndex(makeMrpack({ formatVersion: 2 }))).toThrow(/format version/i);
    expect(() => readMrpackIndex(makeMrpack({ game: "terraria" }))).toThrow(/only Minecraft/i);
    expect(() => readMrpackIndex(makeMrpack({ files: "nope" as any }))).toThrow(/files/);
  });
});

describe("safePackPath", () => {
  it("accepts and normalizes nested relative paths", () => {
    expect(safePackPath("mods/sub/mod.jar")).toBe(path.join("mods", "sub", "mod.jar"));
  });

  it("rejects traversal, absolute, backslash, drive, and malformed paths", () => {
    for (const p of [
      "../evil.txt",
      "mods/../../evil",
      "/etc/passwd",
      "mods\\evil.jar",
      "C:\\evil.jar",
      "mods//x.jar",
      "mods/./x.jar",
      "",
    ]) {
      expect(() => safePackPath(p)).toThrow(/unsafe|invalid/i);
    }
  });
});

describe("selectServerFiles", () => {
  const file = (p: string, server?: string) => ({
    path: p, hashes: {}, downloads: [],
    env: server ? { client: "required", server } : undefined,
  });

  it("splits required/optional/client-only, defaulting absent env to required", () => {
    const { install, clientOnly, optional } = selectServerFiles([
      file("mods/a.jar", "required"),
      file("mods/b.jar", "unsupported"),
      file("mods/c.jar", "optional"),
      file("mods/d.jar"),
      file("mods/e.jar", undefined),
    ]);
    expect(install.map((f) => f.path)).toEqual(["mods/a.jar", "mods/c.jar", "mods/d.jar", "mods/e.jar"]);
    expect(clientOnly.map((f) => f.path)).toEqual(["mods/b.jar"]);
    expect(optional.map((f) => f.path)).toEqual(["mods/c.jar"]);
  });

  it("treats a null env as required", () => {
    const { install, clientOnly } = selectServerFiles([{ path: "x", hashes: {}, downloads: [], env: null }]);
    expect(install).toHaveLength(1);
    expect(clientOnly).toHaveLength(0);
  });
});

describe("verifyFileHash", () => {
  const buf = Buffer.from("hello world");

  it("verifies sha512 and sha1 digests", () => {
    expect(verifyFileHash(buf, { sha512: digest("sha512", buf) })).toBe(true);
    expect(verifyFileHash(buf, { sha1: digest("sha1", buf) })).toBe(true);
    expect(verifyFileHash(buf, { sha1: digest("sha1", buf).toUpperCase() })).toBe(true);
  });

  it("rejects mismatches and files without hashes (fails closed)", () => {
    expect(verifyFileHash(buf, { sha512: "0".repeat(128) })).toBe(false);
    expect(verifyFileHash(buf, {})).toBe(false);
    expect(verifyFileHash(Buffer.from("tampered"), { sha1: digest("sha1", buf) })).toBe(false);
  });
});

describe("extractMrpackOverrides", () => {
  it("applies overrides/ and server-overrides/ but never client-overrides/", () => {
    const zip = makeMrpack({}, {
      "overrides/config.toml": "a",
      "overrides/sub/deep.txt": "b",
      "server-overrides/server.txt": "c",
      "client-overrides/secret.txt": "d",
      "loose-file.txt": "e",
    });
    expect(extractMrpackOverrides(zip, dir)).toBe(3);
    expect(fs.readFileSync(path.join(dir, "config.toml"), "utf-8")).toBe("a");
    expect(fs.readFileSync(path.join(dir, "sub", "deep.txt"), "utf-8")).toBe("b");
    expect(fs.readFileSync(path.join(dir, "server.txt"), "utf-8")).toBe("c");
    expect(fs.existsSync(path.join(dir, "secret.txt"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "loose-file.txt"))).toBe(false);
  });

  it("blocks zip-slip attempts inside override entries", () => {
    // adm-zip's writer sanitizes "..", so a hostile entry is stubbed the way a
    // hand-crafted archive would present it: raw traversal name on read.
    const hostileZip = {
      getEntries: () => [
        { entryName: "overrides/../../escaped.txt", isDirectory: false, getData: () => Buffer.from("evil") },
        { entryName: "overrides/ok.txt", isDirectory: false, getData: () => Buffer.from("fine") },
      ],
    } as unknown as AdmZip;
    expect(() => extractMrpackOverrides(hostileZip, dir)).toThrow(/unsafe/i);
    expect(fs.existsSync(path.resolve(dir, "../../escaped.txt"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "ok.txt"))).toBe(false); // nothing applied when the batch is hostile
  });
});

describe("loaderRequirement", () => {
  const fullIndex = (dependencies: Record<string, string>): MrpackIndex => ({
    formatVersion: 1,
    game: "minecraft",
    versionId: "1.0.0",
    name: "P",
    dependencies,
    files: [],
  });

  it("reads the pinned loader from the dependencies map", () => {
    expect(loaderRequirement(fullIndex(fabricDeps))).toEqual({
      type: "fabric",
      version: "0.15.7",
    });
    expect(loaderRequirement(fullIndex({ minecraft: "1.20.4", "quilt-loader": "0.21.0" }))).toEqual({
      type: "quilt",
      version: "0.21.0",
    });
    expect(loaderRequirement(fullIndex({ minecraft: "1.20.4", forge: "47.1.0" }))).toEqual({
      type: "forge",
      version: "47.1.0",
    });
  });

  it("returns null for vanilla packs and absent dependencies", () => {
    expect(loaderRequirement(fullIndex({ minecraft: "1.20.4" }))).toBeNull();
    expect(loaderRequirement(fullIndex({}))).toBeNull();
  });
});
