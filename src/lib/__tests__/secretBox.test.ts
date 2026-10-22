import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  resetSecretKeyCache,
  SERVER_SECRET_FIELDS,
} from "../secretBox";

const dirs: string[] = [];

function freshKeyDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secretbox-test-"));
  dirs.push(dir);
  return dir;
}

beforeEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  process.env.GAMEVAULT_DATA_DIR = freshKeyDir();
  resetSecretKeyCache();
});

afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("secretBox", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("s3cret-pw");
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("s3cret-pw");
    expect(decryptSecret(enc)).toBe("s3cret-pw");
  });

  it("persists the key file so values survive a cache reset (restart)", () => {
    const enc = encryptSecret("stable");
    resetSecretKeyCache();
    expect(decryptSecret(enc)).toBe("stable");
    expect(fs.existsSync(path.join(process.env.GAMEVAULT_DATA_DIR!, "secret.key"))).toBe(true);
  });

  it("is idempotent — encrypting ciphertext does not double-encrypt", () => {
    const once = encryptSecret("value");
    expect(encryptSecret(once)).toBe(once);
  });

  it("passes legacy plaintext through decryption untouched", () => {
    expect(decryptSecret("plain-old-password")).toBe("plain-old-password");
    expect(decryptSecret(null)).toBeNull();
  });

  it("keeps null/empty as-is on encrypt (no enc prefix for empties)", () => {
    expect(encryptSecret(null)).toBeNull();
    expect(encryptSecret("")).toBe("");
  });

  it("returns empty string for tampered ciphertext instead of throwing", () => {
    const enc = encryptSecret("integrity matters")!;
    const tampered = enc.slice(0, -6) + "AAAA==";
    expect(decryptSecret(tampered)).toBe("");
  });

  it("manages exactly the Server secret fields", () => {
    expect([...SERVER_SECRET_FIELDS]).toEqual(["password", "rconPassword", "sftpPassword"]);
  });
});
