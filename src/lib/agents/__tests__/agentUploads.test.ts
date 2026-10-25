import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  recordUpload, takeUpload, issueDownloadToken, takeDownloadToken, revokeDownloadToken,
} from "../agentUploads";

// One-shot transfer registry: opaque ids bound to node+server, consumed
// exactly once, expired entries swept. The agent never gets a stable URL.

describe("agent transfer registry", () => {
  let tmp: string;
  let file: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-upload-test-"));
    file = path.join(tmp, "world.tar");
    fs.writeFileSync(file, "tar-bytes");
  });

  it("issues an id the right node+server can take exactly once", () => {
    const id = recordUpload(file, "node-1", "srv");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(takeUpload(id, "node-1", "srv")?.filePath).toBe(file);
    expect(takeUpload(id, "node-1", "srv")).toBeNull();
  });

  it("binds the id to node and server", () => {
    const id = recordUpload(file, "node-1", "srv");
    expect(takeUpload(id, "node-2", "srv")).toBeNull();
    expect(takeUpload(id, "node-1", "other")).toBeNull();
    expect(takeUpload(id, "node-1", "srv")).not.toBeNull();
  });

  it("download tokens work the same and revoke works without consuming", () => {
    const token = issueDownloadToken(file, "node-1", "srv");
    expect(takeDownloadToken(token, "node-1", "srv")?.filePath).toBe(file);
    const token2 = issueDownloadToken(file, "node-1", "srv");
    revokeDownloadToken(token2);
    expect(takeDownloadToken(token2, "node-1", "srv")).toBeNull();
  });

  it("expired entries are swept on next access", async () => {
    const id = recordUpload(file, "node-1", "srv");
    // Registry TTL is 15 min; fake the entry's expiry via the internal map.
    const g = globalThis as any;
    const entry = g.agentUploads.get(id);
    entry.expiresAt = Date.now() - 1000;
    expect(takeUpload(id, "node-1", "srv")).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });
});
