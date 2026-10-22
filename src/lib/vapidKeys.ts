import fs from "fs";
import path from "path";
import webpush from "web-push";
import { dataRoot } from "./appPaths";

export interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

const KEYS_FILE = "push-vapid-keys.json";

let cached: VapidKeyPair | null = null;

function readKeysFile(filePath: string): VapidKeyPair | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (parsed && typeof parsed.publicKey === "string" && typeof parsed.privateKey === "string") {
      return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
    }
  } catch {
    // missing or corrupt — regenerate below
  }
  return null;
}

/**
 * VAPID keys for web push. Env vars win when set (VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY); otherwise a keypair is generated once and persisted next
 * to the app data so push notifications work out of the box without manual
 * setup. Key rotation would invalidate every existing subscription, so the
 * generated pair must survive restarts — never regenerate when the file exists.
 */
export function getVapidKeys(): VapidKeyPair {
  if (cached) return cached;

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }

  const filePath = path.join(dataRoot(), KEYS_FILE);
  let keys = readKeysFile(filePath);
  if (!keys) {
    const generated = webpush.generateVAPIDKeys();
    keys = { publicKey: generated.publicKey, privateKey: generated.privateKey };
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(keys, null, 2), { mode: 0o600 });
    } catch (err) {
      console.error("Failed to persist VAPID keys (will regenerate next start):", err);
    }
  }
  cached = keys;
  return keys;
}

/** Test hook: drop the memoized pair. */
export function resetVapidKeysCache(): void {
  cached = null;
}
