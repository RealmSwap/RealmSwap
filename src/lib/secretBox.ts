import crypto from "crypto";
import fs from "fs";
import path from "path";
import { dataRoot } from "./appPaths";

/**
 * Encryption-at-rest for Server secrets (game password, rconPassword,
 * sftpPassword) in the local SQLite database.
 *
 * AES-256-GCM with a per-install master key stored in `secret.key` next to the
 * app data (0600). Threat model: the database file leaking or being shared
 * (backups, git accidents, support requests, marketplace templates) no longer
 * exposes secrets — reading them requires the app's data directory too. This
 * is not protection against an attacker with full local access; on-disk key
 * storage is the deliberate trade-off to stay dependency-free and work in
 * both the Electron app and plain `next dev`.
 *
 * Values are prefixed `enc:v1:` so pre-encryption rows read as plaintext
 * (lazy migration) and the format can evolve.
 */

const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const file = path.join(dataRoot(), "secret.key");
  if (fs.existsSync(file)) {
    const key = Buffer.from(fs.readFileSync(file, "utf-8").trim(), "hex");
    if (key.length === 32) {
      cachedKey = key;
      return key;
    }
    console.error("secret.key is malformed — generating a new one (encrypted values become unreadable)");
  }
  const key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, key.toString("hex") + "\n", { mode: 0o600 });
  } catch (err) {
    console.error("Failed to persist secret.key:", err);
  }
  cachedKey = key;
  return key;
}

/** Test hook: drop the memoized key. */
export function resetSecretKeyCache(): void {
  cachedKey = null;
}

/** Test hook: point the key loader at a directory. */
export function setSecretKeyDirForTest(dir: string | null): void {
  process.env.GAMEVAULT_DATA_DIR = dir ?? "";
  resetSecretKeyCache();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return plain ?? null;
  if (isEncrypted(plain)) return plain; // idempotent
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + iv.toString("base64") + ":" + tag.toString("base64") + ":" + ct.toString("base64");
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isEncrypted(value)) return value; // legacy plaintext — reads as-is
  try {
    const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf-8");
  } catch (err) {
    // Wrong key or corrupted ciphertext. Returning the empty string keeps the
    // app running (config writers already handle empty passwords); silent
    // failure is logged loudly here.
    console.error("Failed to decrypt secret — returning empty value:", err);
    return "";
  }
}

/** The Server fields managed by the transparent Prisma-boundary encryption. */
export const SERVER_SECRET_FIELDS = ["password", "rconPassword", "sftpPassword"] as const;
