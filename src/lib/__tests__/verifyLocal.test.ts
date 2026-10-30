import { describe, it, expect, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { verifySupabaseTokenLocal } from "../supabase/verifyLocal";

const SECRET = "test-jwt-secret";

function sign(payload: object, options: jwt.SignOptions = {}) {
  return jwt.sign({ role: "authenticated", ...payload }, SECRET, {
    algorithm: "HS256",
    ...options,
  });
}

describe("verifySupabaseTokenLocal", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.SUPABASE_JWT_SECRET;
  });

  it("verifies a valid HS256 token and returns the payload", () => {
    const token = sign({ sub: "user-1", email: "a@b.c" });
    const payload = verifySupabaseTokenLocal(token);
    expect(payload?.sub).toBe("user-1");
    expect(payload?.email).toBe("a@b.c");
  });

  it("rejects an expired token (falls back to the online refresh path)", () => {
    const token = sign({ sub: "user-1" }, { expiresIn: "-10s" });
    expect(verifySupabaseTokenLocal(token)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = jwt.sign({ sub: "user-1" }, "wrong-secret", { algorithm: "HS256" });
    expect(verifySupabaseTokenLocal(token)).toBeNull();
  });

  it("returns null when SUPABASE_JWT_SECRET is not configured", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    const token = sign({ sub: "user-1" });
    expect(verifySupabaseTokenLocal(token)).toBeNull();
  });

  it("rejects tokens without a sub claim", () => {
    const token = jwt.sign({ foo: "bar" }, SECRET, { algorithm: "HS256" });
    expect(verifySupabaseTokenLocal(token)).toBeNull();
  });
});
