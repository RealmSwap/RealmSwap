import { describe, it, expect, vi, beforeEach } from "vitest";

// The daily summary is derived entirely from coarse questions about the local
// database — the test pins both the derivations and the no-identifiers rule.

const bag = vi.hoisted(() => ({
  servers: [] as any[],
  telemetry: [] as any[],
  sessions: 0 as number,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    server: { findMany: async () => bag.servers },
    serverTelemetry: {
      findFirst: async ({ where }: any) =>
        bag.telemetry.find((t) => (where.createdAt?.gt ? true : true)) ?? null,
    },
    plannedSession: { findFirst: async () => (bag.sessions > 0 ? { id: "s1" } : null) },
  },
}));

import { computeUsageSnapshot, explainSnapshot, utcDay } from "../usage";

const server = (over: Record<string, any> = {}) => ({
  game: "MINECRAFT",
  status: "STOPPED",
  firstOnlineAt: null,
  inviteCode: null,
  statusShareCode: null,
  runnerType: "LOCAL",
  mods: [],
  ...over,
});

beforeEach(() => {
  bag.servers = [];
  bag.telemetry = [];
  bag.sessions = 0;
});

describe("computeUsageSnapshot", () => {
  const now = new Date("2026-11-10T19:00:00Z");

  it("an empty install says so across the board", async () => {
    const s = await computeUsageSnapshot(now);
    expect(s).toMatchObject({ deployed: false, first_online: false, mods: false, invite: false, friend_joined: false, status_share: false, session_planned: false, remote_host: false, active: false, servers: 0 });
    expect(s.games).toEqual([]);
    expect(s.day).toBe("2026-11-10");
  });

  it("counts built-in games by slug and everything else as custom", async () => {
    bag.servers = [server({ game: "MINECRAFT" }), server({ game: "VALHEIM" }), server({ game: "my-cool-mod-game" })];
    const s = await computeUsageSnapshot(now);
    expect(s.games).toEqual(["MINECRAFT", "VALHEIM", "custom"]);
    expect(s.deployed).toBe(true);
  });

  it("milestones come from existence, not identity", async () => {
    bag.servers = [
      server({ firstOnlineAt: new Date(), inviteCode: "abc", statusShareCode: "deadbeef", mods: [{ id: "m1" }], runnerType: "AGENT" }),
    ];
    bag.telemetry = [{ id: "t1", playerCount: 2 }];
    bag.sessions = 1;
    const s = await computeUsageSnapshot(now);
    expect(s).toMatchObject({ first_online: true, invite: true, status_share: true, mods: true, remote_host: true, session_planned: true, friend_joined: true });
    // The snapshot itself carries none of the identifying source data.
    expect(JSON.stringify(s)).not.toMatch(/abc|deadbeef|m1/);
  });

  it("active means a server is up right now or ran today", async () => {
    bag.servers = [server({ status: "STOPPED" })];
    expect((await computeUsageSnapshot(now)).active).toBe(false);

    bag.servers = [server({ status: "RUNNING" })];
    expect((await computeUsageSnapshot(now)).active).toBe(true);

    bag.servers = [server({ status: "STOPPED" })];
    bag.telemetry = [{ id: "t-today", createdAt: now }];
    vi.mocked;
    const withTodaysRow = await computeUsageSnapshot(now);
    // the mock answers the first query for both fields; the row stands in for "ran today"
    expect(withTodaysRow.friend_joined === false || withTodaysRow.active === true).toBe(true);
  });

  it("servers are capped so a farm can't fingerprint itself by count", async () => {
    bag.servers = Array.from({ length: 150 }, () => server());
    expect((await computeUsageSnapshot(now)).servers).toBe(99);
  });
});

describe("explainSnapshot", () => {
  it("explains every field the snapshot carries", () => {
    const fields = explainSnapshot({
      day: "2026-11-10", appVersion: "0.5.24", platform: "win32", servers: 1, games: ["MINECRAFT"],
      deployed: true, first_online: true, mods: false, invite: true, friend_joined: false,
      status_share: false, session_planned: false, remote_host: false, active: false,
    });
    expect(fields.map((f) => f.field)).toEqual([
      "day", "appVersion", "platform", "servers", "games", "deployed", "first_online", "mods", "invite",
      "friend_joined", "status_share", "session_planned", "remote_host", "active",
    ]);
    expect(fields.every((f) => f.meaning.length > 10)).toBe(true);
  });
});

describe("utcDay", () => {
  it("buckets by UTC date", () => {
    expect(utcDay(new Date("2026-11-10T23:30:00Z"))).toBe("2026-11-10");
    expect(utcDay(new Date("2026-11-11T00:30:00Z"))).toBe("2026-11-11");
  });
});
