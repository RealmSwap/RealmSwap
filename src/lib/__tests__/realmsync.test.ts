import { describe, it, expect, vi } from "vitest";
import {
  REALMSYNC_PROTOCOL_VERSION,
  generateInviteCodeParts,
  splitInviteCode,
  secretFromStoredInvite,
  syncAuthToken,
  verifyAuthToken,
  authHeader,
  signBody,
  verifyBodySignature,
  parseInviteLink,
  isLegacyInviteLink,
  isBlockedSyncHost,
  manifestSchema,
  fetchVerifiedManifest,
  FailureLimiter,
} from "@/lib/realmsync";

describe("invite codes", () => {
  it("generates an 8-hex codeId + 32-hex secret", () => {
    const parts = generateInviteCodeParts();
    expect(parts.codeId).toMatch(/^[0-9A-F]{8}$/);
    expect(parts.secret).toMatch(/^[0-9A-F]{32}$/);
  });

  it("splitInviteCode accepts a valid combined code and rejects bad shapes", () => {
    const parts = generateInviteCodeParts();
    expect(splitInviteCode(parts.codeId + parts.secret)).toEqual(parts);
    // legacy 6-char code
    expect(splitInviteCode("ABCDEF")).toBeNull();
    // non-hex
    expect(splitInviteCode("ZZZZZZZZ".padEnd(40, "A"))).toBeNull();
    // wrong length
    expect(splitInviteCode("ABCD")).toBeNull();
  });

  it("secretFromStoredInvite extracts the secret from a stored inviteCode", () => {
    const parts = generateInviteCodeParts();
    const stored = `1.2.3.4:3001/${parts.codeId}${parts.secret}`;
    expect(secretFromStoredInvite(stored)).toBe(parts.secret);
    // legacy rows (6-char code) are unauthenticatable
    expect(secretFromStoredInvite("1.2.3.4:3001/ABCDEF")).toBeNull();
    expect(secretFromStoredInvite(null)).toBeNull();
  });
});

describe("request auth + body signatures", () => {
  const secret = generateInviteCodeParts().secret;

  it("round-trips an auth token for the same method+path", () => {
    const token = syncAuthToken(secret, "GET", "/sync/ABCD1234/manifest");
    expect(verifyAuthToken(secret, "GET", "/sync/ABCD1234/manifest", token)).toBe(true);
  });

  it("rejects tokens for a different path or method (MITM relay across routes)", () => {
    const token = syncAuthToken(secret, "GET", "/sync/ABCD1234/manifest");
    expect(verifyAuthToken(secret, "GET", "/sync/ABCD1234/configs", token)).toBe(false);
    expect(verifyAuthToken(secret, "POST", "/sync/ABCD1234/manifest", token)).toBe(false);
  });

  it("rejects malformed tokens and wrong secrets", () => {
    expect(verifyAuthToken(secret, "GET", "/sync/ABCD1234/manifest", "deadbeef")).toBe(false);
    expect(verifyAuthToken(secret, "GET", "/sync/ABCD1234/manifest", null)).toBe(false);
    expect(
      verifyAuthToken("F".repeat(32), "GET", "/sync/ABCD1234/manifest", syncAuthToken(secret, "GET", "/sync/ABCD1234/manifest"))
    ).toBe(false);
  });

  it("authHeader produces a verifiable header value", () => {
    const header = authHeader(secret, "GET", "/sync/ABCD1234/manifest");
    expect(header).toMatch(/^RealmSync [0-9a-f]{64}$/);
    expect(verifyAuthToken(secret, "GET", "/sync/ABCD1234/manifest", header.slice("RealmSync ".length))).toBe(true);
  });

  it("verifies body signatures and detects tampering", () => {
    const body = Buffer.from("config archive bytes");
    const sig = signBody(secret, body);
    expect(verifyBodySignature(secret, body, sig)).toBe(true);
    expect(verifyBodySignature(secret, Buffer.from("config archive bytes tampered"), sig)).toBe(false);
    expect(verifyBodySignature(secret, body, "0".repeat(64))).toBe(false);
    expect(verifyBodySignature(secret, body, null)).toBe(false);
  });
});

describe("invite link parsing", () => {
  const parts = generateInviteCodeParts();

  it("parses a valid link", () => {
    expect(parseInviteLink(`realmsync://1.2.3.4:3001/${parts.codeId}${parts.secret}`)).toEqual({
      host: "1.2.3.4:3001",
      ...parts,
    });
    expect(parseInviteLink(`realmsync://myhost.example.com/${parts.codeId}${parts.secret}`)).toEqual({
      host: "myhost.example.com",
      ...parts,
    });
  });

  it("rejects legacy, malformed, and blocked-host links", () => {
    expect(parseInviteLink("realmsync://1.2.3.4:3001/ABCDEF")).toBeNull();
    expect(parseInviteLink("realmsync://1.2.3.4:3001")).toBeNull();
    expect(parseInviteLink("not-a-link")).toBeNull();
    expect(parseInviteLink(null)).toBeNull();
    // host with path/scheme injection
    expect(parseInviteLink(`realmsync://evil.com/x?y=1#z/${parts.codeId}${parts.secret}`)).toBeNull();
    // blocked hosts
    expect(parseInviteLink(`realmsync://127.0.0.1:3001/${parts.codeId}${parts.secret}`)).toBeNull();
    expect(parseInviteLink(`realmsync://169.254.169.254/${parts.codeId}${parts.secret}`)).toBeNull();
    expect(parseInviteLink(`realmsync://metadata.google.internal/${parts.codeId}${parts.secret}`)).toBeNull();
    // LAN hosts are legitimate
    expect(parseInviteLink(`realmsync://192.168.1.50:3001/${parts.codeId}${parts.secret}`)).not.toBeNull();
  });

  it("flags legacy links so the UI can ask for a fresh invite", () => {
    expect(isLegacyInviteLink("realmsync://1.2.3.4:3001/ABCDEF")).toBe(true);
    expect(isLegacyInviteLink(`realmsync://1.2.3.4:3001/${parts.codeId}${parts.secret}`)).toBe(false);
  });

  it("isBlockedSyncHost blocks loopback and metadata but not LAN or public IPs", () => {
    expect(isBlockedSyncHost("127.0.0.1")).toBe(true);
    expect(isBlockedSyncHost("localhost")).toBe(true);
    expect(isBlockedSyncHost("169.254.169.254")).toBe(true);
    expect(isBlockedSyncHost("0.0.0.0")).toBe(true);
    expect(isBlockedSyncHost("192.168.1.50")).toBe(false);
    expect(isBlockedSyncHost("8.8.8.8")).toBe(false);
  });
});

describe("manifest schema", () => {
  const validManifest = {
    protocolVersion: REALMSYNC_PROTOCOL_VERSION,
    serverName: "My Server",
    game: "VALHEIM",
    address: "1.2.3.4:2456",
    mods: [
      { provider: "thunderstore", packageId: "denikson-BepInExPack_Valheim", version: "5.4.2200", name: "BepInEx" },
    ],
  };

  it("accepts a host-shaped manifest", () => {
    expect(manifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it("rejects garbage and wrong-typed manifests", () => {
    expect(manifestSchema.safeParse(null).success).toBe(false);
    expect(manifestSchema.safeParse({ ...validManifest, mods: "none" }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...validManifest, serverName: "" }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...validManifest, mods: [{ provider: "", packageId: "x", version: "1" }] }).success).toBe(false);
  });
});

describe("fetchVerifiedManifest", () => {
  const parts = generateInviteCodeParts();
  const manifest = {
    protocolVersion: REALMSYNC_PROTOCOL_VERSION,
    serverName: "S",
    game: "VALHEIM",
    address: "1.2.3.4:2456",
    mods: [],
  };

  function makeFetch(status: number, body: unknown, opts: { sig?: string | null } = {}) {
    const bodyText = typeof body === "string" ? body : JSON.stringify(body);
    const sig = opts.sig === undefined ? signBody(parts.secret, bodyText) : opts.sig;
    return (async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Map([["x-realmsync-signature", sig]]) as any,
      text: async () => bodyText,
    })) as unknown as typeof fetch;
  }

  it("returns a parsed manifest for a signed ok response", async () => {
    const result = await fetchVerifiedManifest("1.2.3.4:3001", parts.codeId, parts.secret, {
      fetchImpl: makeFetch(200, manifest),
    });
    expect(result.serverName).toBe("S");
  });

  it("throws on a tampered signature", async () => {
    await expect(
      fetchVerifiedManifest("1.2.3.4:3001", parts.codeId, parts.secret, {
        fetchImpl: makeFetch(200, manifest, { sig: "0".repeat(64) }),
      })
    ).rejects.toThrow(/integrity/i);
  });

  it("throws on a protocol version mismatch", async () => {
    await expect(
      fetchVerifiedManifest("1.2.3.4:3001", parts.codeId, parts.secret, {
        fetchImpl: makeFetch(200, { ...manifest, protocolVersion: 1 }),
      })
    ).rejects.toThrow(/protocol/i);
  });

  it("throws a fresh-invite message on 401/429", async () => {
    await expect(
      fetchVerifiedManifest("1.2.3.4:3001", parts.codeId, parts.secret, {
        fetchImpl: makeFetch(401, "Unauthorized"),
      })
    ).rejects.toThrow(/fresh invite/i);
  });

  it("throws on a malformed body", async () => {
    await expect(
      fetchVerifiedManifest("1.2.3.4:3001", parts.codeId, parts.secret, {
        fetchImpl: makeFetch(200, "<<<not json>>>"),
      })
    ).rejects.toThrow(/malformed/i);
  });
});

describe("FailureLimiter", () => {
  it("blocks after max failures within the window and unblocks after it passes", () => {
    vi.useFakeTimers();
    const limiter = new FailureLimiter(3, 60_000);
    limiter.fail("1.2.3.4");
    limiter.fail("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
    limiter.fail("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4")).toBe(true);

    vi.advanceTimersByTime(61_000);
    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
    vi.useRealTimers();
  });

  it("reset clears the count after a success", () => {
    const limiter = new FailureLimiter(2, 60_000);
    limiter.fail("5.6.7.8");
    limiter.fail("5.6.7.8");
    expect(limiter.isBlocked("5.6.7.8")).toBe(true);
    limiter.reset("5.6.7.8");
    expect(limiter.isBlocked("5.6.7.8")).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = new FailureLimiter(1, 60_000);
    limiter.fail("a");
    expect(limiter.isBlocked("a")).toBe(true);
    expect(limiter.isBlocked("b")).toBe(false);
  });
});
