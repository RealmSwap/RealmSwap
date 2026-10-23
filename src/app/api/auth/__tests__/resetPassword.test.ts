import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Password-reset API contract: the request never reveals whether the account
 * exists, the recovery redirect points at the in-app PKCE exchange route, and
 * setting the new password requires the session the email link established.
 */

const bag = vi.hoisted(() => ({
  resetError: null as any,
  user: { user: { id: "supa-1", email: "a@b.c" } } as any,
  userError: null as any,
  updateError: null as any,
  updateCalls: [] as any[],
  resetCalls: [] as any[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: async (email: string, options: any) => {
        bag.resetCalls.push({ email, options });
        return { data: {}, error: bag.resetError };
      },
      getUser: async () => ({ data: bag.user, error: bag.userError }),
      updateUser: async (attrs: any) => {
        bag.updateCalls.push(attrs);
        return { data: {}, error: bag.updateError };
      },
    },
  }),
}));

import { POST as postReset } from "@/app/api/auth/reset-password/route";
import { POST as postUpdate } from "@/app/api/auth/update-password/route";

function req(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
}

beforeEach(() => {
  bag.resetError = null;
  bag.user = { user: { id: "supa-1", email: "a@b.c" } };
  bag.userError = null;
  bag.updateError = null;
  bag.updateCalls = [];
  bag.resetCalls = [];
});

describe("POST /api/auth/reset-password", () => {
  it("sends a recovery email whose redirect lands on the in-app callback", async () => {
    const res = await postReset(req("http://localhost:3000/api/auth/reset-password", { email: "A@B.c" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(bag.resetCalls[0].email).toBe("a@b.c");
    expect(bag.resetCalls[0].options.redirectTo).toBe("http://localhost:3000/auth/callback?next=/reset-password");
  });

  it("rejects a missing email", async () => {
    const res = await postReset(req("http://localhost:3000/api/auth/reset-password", {}));
    expect(res.status).toBe(400);
    expect(bag.resetCalls.length).toBe(0);
  });

  it("maps the Supabase rate limit to a 429 with a clear message", async () => {
    bag.resetError = { message: "Email rate limit exceeded" };
    const res = await postReset(req("http://localhost:3000/api/auth/reset-password", { email: "a@b.c" }));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/wait/i);
  });
});

describe("POST /api/auth/update-password", () => {
  it("refuses without the session the recovery link established", async () => {
    bag.user = null;
    bag.userError = { message: "no session" };
    const res = await postUpdate(req("http://localhost:3000/api/auth/update-password", { password: "hunter22" }));
    expect(res.status).toBe(401);
    expect(bag.updateCalls.length).toBe(0);
  });

  it("updates the password with a valid session", async () => {
    const res = await postUpdate(req("http://localhost:3000/api/auth/update-password", { password: "hunter22" }));
    expect(res.status).toBe(200);
    expect(bag.updateCalls[0]).toEqual({ password: "hunter22" });
  });

  it("surfaces Supabase policy rejections", async () => {
    bag.updateError = { message: "Password should be at least 6 characters." };
    const res = await postUpdate(req("http://localhost:3000/api/auth/update-password", { password: "x" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/at least 6/);
  });
});
