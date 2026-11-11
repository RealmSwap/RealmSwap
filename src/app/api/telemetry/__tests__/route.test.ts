import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// The consent route: preview for any signed-in user, the decision ADMIN-only,
// and enabling sends the first snapshot immediately.

const bag = vi.hoisted(() => ({
  user: null as { id: string; role: string } | null,
  settings: new Map<string, string>(),
  servers: [] as any[],
  telemetry: [] as any[],
  sessions: 0 as number,
  sendResult: "sent" as string,
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => bag.user }));
vi.mock("@/lib/db", () => ({
  prisma: {
    appSetting: {
      findUnique: async ({ where }: any) => (bag.settings.has(where.key) ? { key: where.key, value: bag.settings.get(where.key) } : null),
      upsert: async ({ where, create }: any) => {
        bag.settings.set(where.key, create.value);
        return {};
      },
    },
    server: { findMany: async () => bag.servers },
    serverTelemetry: { findFirst: async () => bag.telemetry[0] ?? null },
    plannedSession: { findFirst: async () => (bag.sessions > 0 ? { id: "s1" } : null) },
  },
}));
vi.mock("@/lib/telemetry/sender", () => ({
  maybeSendUsageSnapshot: async () => bag.sendResult,
  startUsageTelemetry: () => {},
}));

import { GET as preview, POST as consent } from "../route";

const post = (body: unknown) =>
  consent(new NextRequest("http://localhost/api/telemetry", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  bag.user = { id: "admin-1", role: "ADMIN" };
  bag.settings.clear();
  bag.servers = [];
  bag.telemetry = [];
  bag.sessions = 0;
  bag.sendResult = "sent";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:3999";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe("/api/telemetry", () => {
  it("preview requires a session", async () => {
    bag.user = null;
    expect((await preview(new NextRequest("http://localhost/api/telemetry"))).status).toBe(401);
    expect((await post({ enabled: true })).status).toBe(401);
  });

  it("only the ADMIN decides", async () => {
    bag.user = { id: "member-1", role: "USER" };
    expect((await post({ enabled: true })).status).toBe(403);
    expect(bag.settings.size).toBe(0);
    // but members can still see what would be sent
    expect((await preview(new NextRequest("http://localhost/api/telemetry"))).status).toBe(200);
  });

  it("the preview explains every field before anyone consents", async () => {
    const res = await preview(new NextRequest("http://localhost/api/telemetry"));
    const body = await res.json();
    expect(body).toMatchObject({ configured: true, enabled: false });
    expect(body.fields.length).toBeGreaterThanOrEqual(10);
    expect(body.fields.every((f: any) => typeof f.meaning === "string" && f.meaning.length > 10)).toBe(true);
  });

  it("enabling persists and sends the first snapshot; disabling forgets the install", async () => {
    bag.servers = [{ game: "MINECRAFT", status: "RUNNING", firstOnlineAt: new Date(), inviteCode: "x", statusShareCode: null, runnerType: "LOCAL", mods: [] }];
    const on = await post({ enabled: true });
    expect(on.status).toBe(200);
    expect(await on.json()).toMatchObject({ enabled: true, sendResult: "sent" });
    expect(JSON.parse(bag.settings.get("telemetry.usage")!)).toMatchObject({ enabled: true });

    const shown = await (await preview(new NextRequest("http://localhost/api/telemetry"))).json();
    expect(shown.enabled).toBe(true);
    expect(shown.snapshot.deployed).toBe(true);

    const off = await post({ enabled: false });
    expect((await off.json()).enabled).toBe(false);
    expect(JSON.parse(bag.settings.get("telemetry.usage")!)).toEqual({ enabled: false, installId: null, lastSentDay: null });
  });

  it("refuses a body that isn't { enabled: boolean }", async () => {
    expect((await post("yes")).status).toBe(400);
    expect((await post({ enabled: "true" })).status).toBe(400);
    expect(bag.settings.size).toBe(0);
  });
});
