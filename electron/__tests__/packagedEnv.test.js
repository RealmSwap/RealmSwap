import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadPackagedEnv, PROVIDER_KEY_NAMES } from "../packagedEnv.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "packaged-env-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeEnvFile(content) {
  const file = path.join(tmpDir, "packaged-env.json");
  fs.writeFileSync(file, content);
  return file;
}

describe("loadPackagedEnv", () => {
  it("applies missing provider keys (trimmed) and reports what it applied", () => {
    writeEnvFile(
      JSON.stringify({
        CURSEFORGE_API_KEY: "  $2a$10$abcdefghijklmnopqrstuv  ",
        STEAM_API_KEY: "ABCDEF0123456789",
      })
    );
    const env = {};
    const applied = loadPackagedEnv(tmpDir, env);
    expect(applied).toEqual(["CURSEFORGE_API_KEY", "STEAM_API_KEY"]);
    expect(env.CURSEFORGE_API_KEY).toBe("$2a$10$abcdefghijklmnopqrstuv");
    expect(env.STEAM_API_KEY).toBe("ABCDEF0123456789");
  });

  it("never overrides a variable the environment already defines", () => {
    writeEnvFile(
      JSON.stringify({ CURSEFORGE_API_KEY: "from-package", STEAM_API_KEY: "from-package" })
    );
    const env = { CURSEFORGE_API_KEY: "from-host" };
    const applied = loadPackagedEnv(tmpDir, env);
    expect(applied).toEqual(["STEAM_API_KEY"]);
    expect(env.CURSEFORGE_API_KEY).toBe("from-host");
  });

  it("skips empty values and only ever injects the allowlisted key names", () => {
    writeEnvFile(
      JSON.stringify({
        CURSEFORGE_API_KEY: "   ",
        DATABASE_URL: "file:/evil.db",
        NODE_ENV: "development",
        STEAM_API_KEY: "ABCDEF0123456789",
      })
    );
    const env = {};
    const applied = loadPackagedEnv(tmpDir, env);
    expect(applied).toEqual(["STEAM_API_KEY"]);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.CURSEFORGE_API_KEY).toBeUndefined();
  });

  it("returns [] on a missing file without throwing", () => {
    const env = {};
    expect(loadPackagedEnv(tmpDir, env)).toEqual([]);
    expect(env).toEqual({});
  });

  it("returns [] on invalid JSON without throwing", () => {
    writeEnvFile("{ not json");
    const env = {};
    expect(loadPackagedEnv(tmpDir, env)).toEqual([]);
    expect(env).toEqual({});
  });

  it("returns [] on non-object JSON", () => {
    writeEnvFile('["CURSEFORGE_API_KEY"]');
    const env = {};
    expect(loadPackagedEnv(tmpDir, env)).toEqual([]);
    expect(env).toEqual({});
  });

  it("ignores non-string values for allowlisted keys", () => {
    writeEnvFile(JSON.stringify({ CURSEFORGE_API_KEY: 12345, STEAM_API_KEY: null }));
    const env = {};
    expect(loadPackagedEnv(tmpDir, env)).toEqual([]);
    expect(env).toEqual({});
  });

  it("allowlist matches the keys the release workflow writes", () => {
    // The writer single-sources its key list from this module; a round-trip
    // through the real script proves the two stay in sync end to end.
    const script = new URL("../../scripts/write-packaged-env.js", import.meta.url).pathname;
    const out = path.join(tmpDir, "out.json");
    const env = { ...process.env };
    delete env.CURSEFORGE_API_KEY;
    delete env.STEAM_API_KEY;
    env.CURSEFORGE_API_KEY = "$2a$10$roundtrip";
    execFileSync(process.execPath, [script, out], { env });
    expect(JSON.parse(fs.readFileSync(out, "utf8"))).toEqual({
      CURSEFORGE_API_KEY: "$2a$10$roundtrip",
    });
  });
});
