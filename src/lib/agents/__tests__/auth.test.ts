import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  mintEnrollToken, mintNodeSecret, sha256Hex,
  syncSigningString, signSync, signResponse, verifySyncAuth, TIMESTAMP_WINDOW_MS,
} from "../auth";

/**
 * The agent auth contract: one-time enrollment tokens, HMAC-signed syncs with
 * a timestamp replay window, and signed responses (a forged response would be
 * RCE on the node). Constant-time comparison everywhere.
 */

const secret = mintNodeSecret();
const nodeId = "node-1";
const body = JSON.stringify({ protocolVersion: 1, servers: [] });
const node = { id: nodeId, status: "ACTIVE", secret };

function signedHeaders(nodeSecret = secret, ts = Date.now().toString(), raw = body, id = nodeId) {
  return {
    nodeId: id,
    timestamp: ts,
    signature: signSync(nodeSecret, id, ts, raw),
  };
}

describe("agent auth", () => {
  it("mints 32-hex enrollment tokens and secrets", () => {
    expect(mintEnrollToken()).toMatch(/^[0-9a-f]{32}$/);
    expect(mintNodeSecret()).toMatch(/^[0-9a-f]{32}$/);
    expect(mintNodeSecret()).not.toBe(mintNodeSecret());
  });

  it("sha256Hex is the enrollment token's stored form", () => {
    const token = mintEnrollToken();
    expect(sha256Hex(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(token)).toBe(sha256Hex(token));
  });

  it("accepts a correctly-signed sync", () => {
    expect(verifySyncAuth(signedHeaders(), body, node)).toEqual({ ok: true });
  });

  it("rejects missing headers", () => {
    expect(verifySyncAuth({}, body, node).reason).toBe("bad_headers");
    expect(verifySyncAuth({ nodeId, timestamp: "1" }, body, node).reason).toBe("bad_headers");
  });

  it("rejects an unknown node and a revoked node", () => {
    expect(verifySyncAuth(signedHeaders(), body, null).reason).toBe("unknown_node");
    expect(verifySyncAuth(signedHeaders(), body, { id: "other", status: "ACTIVE", secret }).reason).toBe("unknown_node");
    expect(verifySyncAuth(signedHeaders(), body, { ...node, status: "REVOKED" }).reason).toBe("revoked");
  });

  it("rejects a node that never enrolled", () => {
    expect(verifySyncAuth(signedHeaders(), body, { ...node, secret: null }).reason).toBe("not_enrolled");
  });

  it("rejects timestamps outside the replay window (both directions)", () => {
    const stale = Date.now() - TIMESTAMP_WINDOW_MS - 1000;
    const future = Date.now() + TIMESTAMP_WINDOW_MS + 1000;
    expect(verifySyncAuth(signedHeaders(undefined, stale.toString()), body, node).reason).toBe("bad_timestamp");
    expect(verifySyncAuth(signedHeaders(undefined, future.toString()), body, node).reason).toBe("bad_timestamp");
  });

  it("rejects a tampered body, wrong secret, and wrong node id", () => {
    expect(verifySyncAuth(signedHeaders(undefined, undefined, body + " "), body, node).reason).toBe("bad_signature");
    expect(verifySyncAuth(signedHeaders("wrong-secret"), body, node).reason).toBe("bad_signature");
    // Identity is checked before cryptography: a header node id that does not
    // match the row is an unknown node, whatever it signed.
    expect(verifySyncAuth(signedHeaders(undefined, undefined, undefined, "node-2"), body, node).reason).toBe("unknown_node");
  });

  it("signs responses over the exact body bytes", () => {
    const raw = JSON.stringify({ commands: [], assignedServers: [] });
    expect(signResponse(secret, raw)).toBe(crypto.createHmac("sha256", secret).update(raw).digest("hex"));
    expect(signResponse(secret, raw)).not.toBe(signResponse(secret, raw + " "));
  });

  it("the signing string binds node id, timestamp, and body", () => {
    expect(syncSigningString("n", "1", "b")).toBe("n\n1\nb");
    // A signature made for one body fails for another even with the same secret.
    const sig = signSync(secret, nodeId, "1", "b");
    expect(verifySyncAuth(
      { nodeId, timestamp: Date.now().toString(), signature: sig },
      "different-body",
      node
    ).reason).toBe("bad_signature");
  });
});
