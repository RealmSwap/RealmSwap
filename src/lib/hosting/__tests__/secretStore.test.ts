import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

let encryptSecret: typeof import("../secretStore").encryptSecret;
let decryptSecret: typeof import("../secretStore").decryptSecret;

beforeAll(async () => {
  // Point dataRoot at a temp dir so the AES keyfile is isolated.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-secret-"));
  process.env.GAMEVAULT_DATA_DIR = dir;
  const mod = await import("../secretStore");
  encryptSecret = mod.encryptSecret;
  decryptSecret = mod.decryptSecret;
});

describe("secretStore", () => {
  it("round-trips a secret through the AES fallback", () => {
    const plain = "hunter2-correct-horse";
    const blob = encryptSecret(plain);
    expect(blob.startsWith("v1:aes:")).toBe(true);
    expect(blob).not.toContain(plain);
    expect(decryptSecret(blob)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("throws on an unknown blob tag", () => {
    expect(() => decryptSecret("v9:bogus:abcd")).toThrow();
  });
});
