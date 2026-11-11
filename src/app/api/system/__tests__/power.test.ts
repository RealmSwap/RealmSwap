import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// The two power routes: the internal-token lookup the desktop shell polls,
// and the ADMIN settings/status API behind the Settings card.

const bag = vi.hoisted(() => ({
  user: null as { id: string; role: string } | null,
  settings: new Map<string, string>(),
  servers: [] as any[],
  playerSample: null as { playerCount: number } | null,
  sessions: [] as any[],
  automations: [] as any[],
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
    serverTelemetry: { findFirst: async () => bag.playerSample },
    plannedSession: { findMany: async () => bag.sessions },
    automation: { findMany: async () => bag.automations },
  },
}));

import { GET as keepAwakeRoute } from "../keep-awake/route";
import { GET as getPower, PUT as putPower } from "../power/route";

const TOKEN = "unit-test-internal-token";
const askKeepAwake = (token?: string) =>
  keepAwakeRoute(new NextRequest("http://localhost/api/system/keep-awake", { headers: token ? { "x-internal-token": token } : {} }));
const put = (body: unknown) =>
  putPower(new NextRequest("http://localhost/api/system/power", { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) }));
const get = () => getPower(new NextRequest("http://localhost/api/system/power"));

beforeEach(() => {
  process.env.GAMEVAULT_INTERNAL_TOKEN = TOKEN;
  bag.user = { id: "admin-1", role: "ADMIN" };
  bag.settings.clear();
  bag.servers = [];
  bag.playerSample = null;
  bag.sessions = [];
  bag.automations = [];
});
afterEach(() => {
  delete process.env.GAMEVAULT_INTERNAL_TOKEN;
});

describe("GET /api/system/keep-awake", () => {
  it("is closed without the internal token", async () => {
    expect((await askKeepAwake()).status).toBe(403);
    expect((await askKeepAwake("wrong")).status).toBe(403);
    delete process.env.GAMEVAULT_INTERNAL_TOKEN;
    expect((await askKeepAwake(TOKEN)).status).toBe(403); // no token configured: fail closed
  });

  it("says no when nothing is running", async () => {
    const res = await askKeepAwake(TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keepAwake: false, reasons: [] });
  });

  it("says yes, with the reason, while players are on a server", async () => {
    bag.servers = [{ id: "s1", name: "Friday Server", status: "RUNNING" }];
    bag.playerSample = { playerCount: 2 };
    const body = await (await askKeepAwake(TOKEN)).json();
    expect(body.keepAwake).toBe(true);
    expect(body.reasons[0]).toMatch(/2 players on Friday Server/);
  });

  it("honors the master switch", async () => {
    bag.servers = [{ id: "s1", name: "Friday Server", status: "RUNNING" }];
    bag.playerSample = { playerCount: 2 };
    bag.settings.set("power.settings", JSON.stringify({ keepAwake: false }));
    expect(await (await askKeepAwake(TOKEN)).json()).toEqual({ keepAwake: false, reasons: [] });
  });
});

describe("/api/system/power", () => {
  it("requires a signed-in ADMIN", async () => {
    bag.user = null;
    expect((await get()).status).toBe(401);
    expect((await put({ keepAwake: false })).status).toBe(401);
    bag.user = { id: "member-1", role: "USER" };
    expect((await get()).status).toBe(403);
    expect((await put({ keepAwake: false })).status).toBe(403);
    expect(bag.settings.size).toBe(0);
  });

  it("reports the defaults and the plan without touching the system outside the desktop app", async () => {
    const dueAt = new Date(Date.now() + 5 * 60 * 60_000);
    bag.automations = [
      { name: "Friday start", nextRunAt: dueAt, lastRunAt: null, server: { id: "s1", name: "Friday Server" } },
    ];
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toEqual({ keepAwake: true, keepAwakeWhileRunning: false, wakeForSchedule: true });
    expect(body.status).toMatchObject({ desktop: false, keepingAwake: false, wakeRegisteredFor: null, wakeTimers: null });
    expect(body.status.nextStart).toMatchObject({ label: "Friday start", serverName: "Friday Server", source: "automation", dueAt: dueAt.toISOString() });
    expect(new Date(body.status.nextStart.wakeAt).getTime()).toBe(dueAt.getTime() - 3 * 60_000);
  });

  it("saves the boolean settings it is given and ignores everything else", async () => {
    const res = await put({ keepAwakeWhileRunning: true, wakeForSchedule: "nope", notASetting: true });
    expect(res.status).toBe(200);
    expect((await res.json()).settings).toEqual({ keepAwake: true, keepAwakeWhileRunning: true, wakeForSchedule: true });
    expect(JSON.parse(bag.settings.get("power.settings")!)).toEqual({ keepAwake: true, keepAwakeWhileRunning: true, wakeForSchedule: true });

    const after = await (await get()).json();
    expect(after.settings.keepAwakeWhileRunning).toBe(true);
  });

  it("refuses a body that isn't an object", async () => {
    expect((await put("[]")).status).toBe(400);
    expect((await put("not json")).status).toBe(400);
  });
});
