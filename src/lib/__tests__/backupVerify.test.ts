import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { verifyBackupFile } from "../backupVerify";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-verify-test-"));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function makeZip(name: string, files: Record<string, string>): string {
  const zip = new AdmZip();
  for (const [entry, content] of Object.entries(files)) zip.addFile(entry, Buffer.from(content, "utf-8"));
  const p = path.join(dir, name);
  zip.writeZip(p);
  return p;
}

describe("verifyBackupFile", () => {
  it("verifies a healthy archive and reports entries", () => {
    const p = makeZip("good.zip", { "world/level.dat": "abc", "world/players.json": "[]" });
    const result = verifyBackupFile(p);
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("fails for a missing file", () => {
    const result = verifyBackupFile(path.join(dir, "nope.zip"));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing/i);
  });

  it("fails for an empty archive — a zip with nothing in it restores nothing", () => {
    const p = makeZip("empty.zip", {});
    const result = verifyBackupFile(p);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no entries/i);
  });

  it("fails for a truncated/corrupted archive", () => {
    const p = makeZip("corrupt.zip", { "world/level.dat": "x".repeat(10_000) });
    const raw = fs.readFileSync(p);
    fs.writeFileSync(p, raw.subarray(0, Math.floor(raw.length / 2))); // chop the deflate streams
    const result = verifyBackupFile(p);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("verifyBackupFile game sentinels", () => {
  it("Minecraft: archive without level.dat fails when game is passed", () => {
    const p = makeZip("wrong-mc.zip", { "something-else.txt": "oops" });
    const result = verifyBackupFile(p, "MINECRAFT");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/level\.dat/);
  });

  it("Minecraft: level.dat at entry root passes", () => {
    const p = makeZip("good-mc.zip", { "level.dat": "abc" });
    expect(verifyBackupFile(p, "MINECRAFT").ok).toBe(true);
  });

  it("Minecraft: level.dat nested in a folder passes", () => {
    const p = makeZip("nested-mc.zip", { "world/level.dat": "abc" });
    expect(verifyBackupFile(p, "minecraft").ok).toBe(true); // case-insensitive game
  });

  it("Valheim: requires Dedicated.db or Dedicated.fwl", () => {
    const bad = makeZip("bad-vh.zip", { "random.txt": "x" });
    expect(verifyBackupFile(bad, "VALHEIM").ok).toBe(false);
    const good = makeZip("good-vh.zip", { "Dedicated.db": "x", "Dedicated.fwl": "y" });
    expect(verifyBackupFile(good, "VALHEIM").ok).toBe(true);
  });

  it("unknown games keep the generic check (no sentinel guessing)", () => {
    const p = makeZip("zomboid.zip", { "some-save": "x" });
    expect(verifyBackupFile(p, "ZOMBOID").ok).toBe(true);
  });
});
