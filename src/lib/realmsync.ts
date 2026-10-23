import crypto from "crypto";
import { z } from "zod";

/**
 * Shared RealmSync v2 protocol helpers. The host server (realmSyncHost.ts) and
 * both client fetch paths (dashboard/sync page + /api/client/sync) import from
 * here so the two sides can never drift.
 *
 * Trust model: the invite code is split into a public codeId (8 hex chars,
 * appears in HTTP paths and is the DB lookup key) and a 128-bit secret (32 hex
 * chars) that travels ONLY inside the realmsync:// deep link / QR code. HTTP is
 * plaintext, so a network attacker sees every request — but never the secret.
 * Requests prove knowledge of the secret via HMAC over method+path; responses
 * are HMAC-signed over the exact body bytes, so a MITM can relay the host's
 * genuine bytes but cannot substitute or tamper with anything.
 */

export const REALMSYNC_PROTOCOL_VERSION = 2;
export const CODE_ID_LENGTH = 8; // hex chars, public path component (32 bits — lookup key only, security lives in the secret)
export const SECRET_LENGTH = 32; // hex chars = 128 bits, never sent over HTTP
const HEX_CODE_RE = /^[0-9A-F]+$/;

export interface InviteCodeParts {
  codeId: string;
  secret: string;
}

export function generateInviteCodeParts(): InviteCodeParts {
  return {
    codeId: crypto.randomBytes(CODE_ID_LENGTH / 2).toString("hex").toUpperCase(),
    secret: crypto.randomBytes(SECRET_LENGTH / 2).toString("hex").toUpperCase(),
  };
}

/** Validate and split the 40-hex-char combined code used in deep links. */
export function splitInviteCode(code: string): InviteCodeParts | null {
  if (typeof code !== "string" || code.length !== CODE_ID_LENGTH + SECRET_LENGTH) return null;
  const upper = code.toUpperCase();
  if (!HEX_CODE_RE.test(upper)) return null;
  return { codeId: upper.slice(0, CODE_ID_LENGTH), secret: upper.slice(CODE_ID_LENGTH) };
}

/**
 * Extract the secret from a stored inviteCode ("1.2.3.4:3001/<codeId><secret>").
 * Rows written before protocol v2 hold 6-char codes and return null — callers
 * must treat that as an unauthenticatable invite.
 */
export function secretFromStoredInvite(inviteCode: string | null): string | null {
  if (!inviteCode) return null;
  const idx = inviteCode.lastIndexOf("/");
  if (idx === -1) return null;
  const parts = splitInviteCode(inviteCode.slice(idx + 1));
  return parts?.secret ?? null;
}

export function syncAuthToken(secret: string, method: string, pathname: string): string {
  return crypto
    .createHmac("sha256", secret.toUpperCase())
    .update(`${method.toUpperCase()}\n${pathname}`)
    .digest("hex");
}

export function verifyAuthToken(
  secret: string,
  method: string,
  pathname: string,
  token: string | null | undefined
): boolean {
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) return false;
  const expected = syncAuthToken(secret, method, pathname);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token.toLowerCase(), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function authHeader(secret: string, method: string, pathname: string): string {
  return `RealmSync ${syncAuthToken(secret, method, pathname)}`;
}

export function signBody(secret: string, body: string | Buffer): string {
  return crypto.createHmac("sha256", secret.toUpperCase()).update(body).digest("hex");
}

export function verifyBodySignature(
  secret: string,
  body: string | Buffer,
  signature: string | null | undefined
): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = signBody(secret, body);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature.toLowerCase(), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]*(:\d{2,5})?$/;

/**
 * Cloud metadata endpoints and loopback. Private LAN ranges stay allowed —
 * same-network invites (friend on 192.168.x) are a primary use case.
 */
export function isBlockedSyncHost(host: string): boolean {
  const hostname = host.split(":")[0].toLowerCase();
  if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "metadata.google.internal") return true;
  if (/^127\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  return false;
}

export interface ParsedInviteLink {
  host: string;
  codeId: string;
  secret: string;
}

/** Strict parser for realmsync://host[:port]/<codeId><secret> links. */
export function parseInviteLink(link: string | null | undefined): ParsedInviteLink | null {
  if (!link || !link.startsWith("realmsync://")) return null;
  const rest = link.slice("realmsync://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const host = rest.slice(0, slash);
  if (!HOST_RE.test(host) || isBlockedSyncHost(host)) return null;
  const parts = splitInviteCode(rest.slice(slash + 1));
  if (!parts) return null;
  return { host, ...parts };
}

/** Detect pre-v2 links (6-char code) so the UI can suggest a fresh invite. */
export function isLegacyInviteLink(link: string | null | undefined): boolean {
  if (!link || !link.startsWith("realmsync://")) return false;
  const code = link.slice(link.lastIndexOf("/") + 1);
  return /^[0-9A-Fa-f]{6}$/.test(code);
}

export const manifestSchema = z.object({
  protocolVersion: z.number().int().min(1).max(99),
  serverName: z.string().min(1).max(100),
  game: z.string().min(1).max(50),
  gameVersion: z.string().max(50).optional(),
  address: z.string().min(1).max(100),
  mods: z.array(
    z.object({
      provider: z.string().min(1).max(50),
      packageId: z.string().min(1).max(200),
      version: z.string().min(1).max(100),
      name: z.string().max(200).optional(),
      dependencies: z.array(z.string().max(300)).optional(),
    })
  ),
  configDownloadUrl: z.string().max(300).optional(),
});

export type RealmSyncManifest = z.infer<typeof manifestSchema>;

/**
 * Fetch the manifest from the host with the HMAC proof, verify the response
 * signature and schema, and enforce the protocol version handshake.
 */
export async function fetchVerifiedManifest(
  host: string,
  codeId: string,
  secret: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<RealmSyncManifest> {
  const doFetch = opts.fetchImpl ?? fetch;
  const pathname = `/sync/${codeId}/manifest`;
  const res = await doFetch(`http://${host}${pathname}`, {
    headers: { Authorization: authHeader(secret, "GET", pathname) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  if (res.status === 401 || res.status === 429) {
    throw new Error("The host rejected this invite link. Ask the host to generate a fresh invite.");
  }
  if (!res.ok) {
    throw new Error(`Could not reach the host's sync server (HTTP ${res.status}). The host may be offline.`);
  }
  const body = await res.text();
  if (!verifyBodySignature(secret, body, res.headers.get("x-realmsync-signature"))) {
    throw new Error("The host's response failed integrity verification. The connection may be tampered with — sync aborted.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error("The host sent a malformed manifest.");
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("The host sent an unsupported manifest.");
  }
  if (parsed.data.protocolVersion !== REALMSYNC_PROTOCOL_VERSION) {
    throw new Error(
      `This host is running RealmSync protocol v${parsed.data.protocolVersion}, but this app speaks v${REALMSYNC_PROTOCOL_VERSION}. One side needs an update.`
    );
  }
  return parsed.data;
}

/**
 * Per-IP failure limiter for the internet-exposed host listener. In-memory by
 * design: the host runs inside the desktop app, one process.
 */
export class FailureLimiter {
  private hits = new Map<string, number[]>();

  constructor(private max: number, private windowMs: number) {}

  fail(key: string): void {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    list.push(now);
    this.hits.set(key, list);
  }

  isBlocked(key: string): boolean {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length !== (this.hits.get(key)?.length ?? 0)) {
      if (list.length === 0) this.hits.delete(key);
      else this.hits.set(key, list);
    }
    return list.length >= this.max;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
