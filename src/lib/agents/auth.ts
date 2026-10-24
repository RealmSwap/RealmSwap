import crypto from "crypto";
import { secureSecretEquals } from "@/lib/secureCompare";

/**
 * RealmSwap agent authentication — the RealmSync pattern (src/lib/realmsync.ts)
 * applied to agent nodes:
 *
 * - Enrollment: an ADMIN mints a one-time token (the dashboard stores only its
 *   sha256); the agent exchanges it once for a 128-bit node secret. The
 *   dashboard keeps the secret encrypted at rest (secretBox) because every
 *   sync must be HMAC-verified with the original; the agent keeps its copy
 *   locally. The secret rides the wire exactly twice: in the register
 *   response, and never again.
 * - Every sync: HMAC-SHA256 over nodeId + timestamp + exact body bytes.
 *   The timestamp window bounds replay.
 * - Responses: HMAC-signed over the exact response body, verified by the
 *   agent — a MITM'd response would otherwise be remote code execution
 *   (commands run docker on the node).
 */

const ENROLL_TOKEN_BYTES = 16; // 32 hex chars
const NODE_SECRET_BYTES = 16; // 128-bit
/** Clock skew tolerated between dashboard and node. */
export const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

export function mintEnrollToken(): string {
  return crypto.randomBytes(ENROLL_TOKEN_BYTES).toString("hex");
}

export function mintNodeSecret(): string {
  return crypto.randomBytes(NODE_SECRET_BYTES).toString("hex");
}

/** The canonical string the agent signs and the dashboard verifies. */
export function syncSigningString(nodeId: string, timestamp: string, rawBody: string): string {
  return `${nodeId}\n${timestamp}\n${rawBody}`;
}

export function signSync(nodeSecret: string, nodeId: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac("sha256", nodeSecret).update(syncSigningString(nodeId, timestamp, rawBody)).digest("hex");
}

/** Response signing (agent verifies before acting on commands). */
export function signResponse(nodeSecret: string, rawBody: string): string {
  return crypto.createHmac("sha256", nodeSecret).update(rawBody).digest("hex");
}

export interface SyncAuthResult {
  ok: boolean;
  reason?: "bad_headers" | "unknown_node" | "not_enrolled" | "revoked" | "bad_timestamp" | "bad_signature";
}

/**
 * Verify a sync request against the node row. Constant-time comparison on
 * the signature; every failure mode is explicit so logs can say why.
 */
export function verifySyncAuth(
  headers: { nodeId?: string | null; timestamp?: string | null; signature?: string | null },
  rawBody: string,
  node: { id: string; status: string; secret: string | null } | null,
  now = Date.now()
): SyncAuthResult {
  const { nodeId, timestamp, signature } = headers;
  if (!nodeId || !timestamp || !signature) return { ok: false, reason: "bad_headers" };
  if (!node || node.id !== nodeId) return { ok: false, reason: "unknown_node" };
  if (node.status === "REVOKED") return { ok: false, reason: "revoked" };
  if (!node.secret) return { ok: false, reason: "not_enrolled" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TIMESTAMP_WINDOW_MS) {
    return { ok: false, reason: "bad_timestamp" };
  }
  const expected = signSync(node.secret, nodeId, timestamp, rawBody);
  if (!secureSecretEquals(expected, signature)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}
