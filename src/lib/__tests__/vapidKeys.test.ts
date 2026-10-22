import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getVapidKeys, resetVapidKeysCache } from "../vapidKeys";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vapid-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("getVapidKeys", () => {
  beforeEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    resetVapidKeysCache();
  });

  it("generates and persists a keypair when no env keys are set", () => {
    process.env.GAMEVAULT_DATA_DIR = freshDataDir();
    const keys = getVapidKeys();
    expect(keys.publicKey.length).toBeGreaterThan(80);
    expect(keys.privateKey.length).toBeGreaterThan(20);
    expect(fs.existsSync(path.join(process.env.GAMEVAULT_DATA_DIR, "push-vapid-keys.json"))).toBe(true);
  });

  it("is stable across calls — never regenerates an existing pair", () => {
    process.env.GAMEVAULT_DATA_DIR = freshDataDir();
    const first = getVapidKeys();
    resetVapidKeysCache();
    const second = getVapidKeys();
    expect(second).toEqual(first);
  });

  it("env keys win over the generated file", () => {
    process.env.GAMEVAULT_DATA_DIR = freshDataDir();
    process.env.VAPID_PUBLIC_KEY = "env-public";
    process.env.VAPID_PRIVATE_KEY = "env-private";
    expect(getVapidKeys()).toEqual({ publicKey: "env-public", privateKey: "env-private" });
    // and nothing was written to disk for the env path
    expect(fs.existsSync(path.join(process.env.GAMEVAULT_DATA_DIR, "push-vapid-keys.json"))).toBe(false);
  });
});
