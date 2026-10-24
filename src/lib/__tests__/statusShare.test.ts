import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getPublicStatus,
  nextSessionFrom,
  clearStatusCache,
  bucketPlayerHistory,
  bucketWeeklyHeatmap,
  busiestHour,
  HISTORY_BUCKET_MS,
} from "../statusShare";

/**
 * The public status page payload. Everything here is what an anonymous
 * visitor holding /s/<code> gets to see — the tests pin both the honest
 * shape (counts, not names; next session, not the roster) and the leak
 * guards (no address/password fields ever exist on the payload).
 */

const bag = vi.hoisted(() => ({
  server: null as any,
  def: null as any,
  serverQueries: 0,
  telemetryRows: [] as { createdAt: Date; playerCount: number | null }[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    get server() {
      return {
        findUnique: async () => {
          bag.serverQueries++;
          return bag.server;
        },
      };
    },
    get gameDefinition() {
      return {
        findUnique: async () => bag.def,
        findFirst: async () => bag.def,
      };
    },
    get serverTelemetry() {
      return {
        findMany: async () => bag.telemetryRows,
      };
    },
  },
}));

const NOW = new Date("2026-10-23T12:00:00Z");

const dig = vi.fn().mockResolvedValue({
  name: "My Server",
  players: [{ name: "p1" }, { name: "p2" }, { name: "p3" }, { name: "p4" }, { name: "p5" }, { name: "p6" }],
  maxplayers: 20,
});

beforeEach(() => {
  clearStatusCache();
  bag.server = null;
  bag.def = { id: "def1", spec: JSON.stringify({ queryType: "minecraft" }) };
  bag.serverQueries = 0;
  bag.telemetryRows = [];
  dig.mockClear();
});

describe("bucketPlayerHistory", () => {
  it("buckets 5-minute stamps into 30-minute buckets keeping each bucket's peak", () => {
    const base = NOW.getTime();
    const rows = [
      { createdAt: new Date(base - 3 * HISTORY_BUCKET_MS), playerCount: 2 },
      { createdAt: new Date(base - 3 * HISTORY_BUCKET_MS + 4 * 60_000), playerCount: 7 },
      { createdAt: new Date(base - 1 * HISTORY_BUCKET_MS), playerCount: 1 },
    ];
    const buckets = bucketPlayerHistory(rows, NOW);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ n: 7 }); // peak of the older bucket
    expect(buckets[1]).toMatchObject({ n: 1 });
    // t is the bucket start, within the last 24h
    expect(new Date(buckets[0].t).getTime()).toBeLessThan(NOW.getTime());
  });

  it("drops out-of-window rows and returns nothing when there is no data yet", () => {
    const old = bucketPlayerHistory(
      [{ createdAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000), playerCount: 9 }],
      NOW
    );
    expect(old).toEqual([]);
    expect(bucketPlayerHistory([], NOW)).toEqual([]);
  });
});

describe("bucketWeeklyHeatmap + busiestHour", () => {
  it("averages stamps per weekday×hour in host-local time", () => {
    // Oct 23 2026 is a Friday; Oct 16 is the Friday one week earlier, inside
    // the 7-day window ending at Friday noon. Local dates keep the
    // weekday/hour bucketing deterministic regardless of the test's TZ.
    const fridayNoon = new Date(2026, 9, 23, 12, 0);
    const rows = [
      { createdAt: new Date(2026, 9, 16, 21, 10), playerCount: 4 },
      { createdAt: new Date(2026, 9, 16, 21, 40), playerCount: 8 },
      { createdAt: new Date(2026, 9, 16, 22, 0), playerCount: 2 },
    ];
    const grid = bucketWeeklyHeatmap(rows, fridayNoon);
    expect(grid).toHaveLength(7);
    expect(grid[0]).toHaveLength(24);
    expect(grid[5][21]).toBe(6); // Friday 9 PM = (4+8)/2
    expect(grid[5][22]).toBe(2); // Friday 10 PM
    expect(grid[5][12]).toBe(0); // quiet hour reads 0, not fake data
    expect(grid[6][21]).toBe(0);
    const busiest = busiestHour(grid);
    expect(busiest).toEqual({ dow: 5, hour: 21, avg: 6 });
  });

  it("drops rows older than the 7-day window and yields all-zero grids to busiestHour=null", () => {
    const fridayNoon = new Date(2026, 9, 23, 12, 0);
    const grid = bucketWeeklyHeatmap(
      [{ createdAt: new Date(fridayNoon.getTime() - 8 * 24 * 60 * 60 * 1000), playerCount: 9 }],
      fridayNoon
    );
    expect(grid.flat().every((v) => v === 0)).toBe(true);
    expect(busiestHour(grid)).toBeNull();
    expect(busiestHour(bucketWeeklyHeatmap([], fridayNoon))).toBeNull();
  });
});

describe("nextSessionFrom", () => {
  it("picks the earliest session that hasn't started yet", () => {
    const rows = [
      { id: "1", title: "Late", startTime: "2026-10-24T22:00:00Z", roster: '["a","b"]' },
      { id: "2", title: "Early", startTime: "2026-10-23T18:00:00Z", roster: '["a"]' },
      { id: "3", title: "Past", startTime: "2026-10-23T06:00:00Z", roster: '["a","b","c"]' },
    ];
    const next = nextSessionFrom(rows, NOW);
    expect(next?.title).toBe("Early");
    expect(next?.rosterCount).toBe(1); // count, never the raw Discord IDs
  });

  it("returns null when only past sessions exist", () => {
    const rows = [{ id: "1", title: "Past", startTime: "2026-10-23T06:00:00Z", roster: "[]" }];
    expect(nextSessionFrom(rows, NOW)).toBeNull();
  });

  it("treats a corrupt roster as zero people rather than crashing", () => {
    const rows = [{ id: "1", title: "Weird", startTime: "2026-10-23T18:00:00Z", roster: "not-json" }];
    expect(nextSessionFrom(rows, NOW)?.rosterCount).toBe(0);
  });
});

describe("getPublicStatus", () => {
  it("returns null for an unknown or disabled code", async () => {
    expect(await getPublicStatus("deadbeef", { prisma: undefined as any, now: NOW })).toBeNull();
  });

  it("serves up + player counts + next session for a running server", async () => {
    bag.server = {
      id: "s1",
      name: "My Server",
      game: "MINECRAFT",
      status: "RUNNING",
      port: 25565,
      ramAllocation: 4,
      password: "secret",
      paramValues: null,
      definitionId: "def1",
      statusShareCode: "abc12345",
      plannedSessions: [
        { id: "1", title: "Friday Night", startTime: "2026-10-23T18:00:00Z", roster: '["a","b","c","d"]' },
      ],
    };

    const status = await getPublicStatus("abc12345", { now: NOW, dig });
    expect(status).toMatchObject({
      code: "abc12345",
      name: "My Server",
      game: "MINECRAFT",
      status: "RUNNING",
      players: 6,
      maxplayers: 20,
    });
    expect(status?.nextSession?.title).toBe("Friday Night");
    expect(status?.nextSession?.rosterCount).toBe(4);
    expect(status?.history).toEqual([]); // no telemetry rows in this fixture

    // Leak guards: the payload must not even have fields for secrets.
    const keys = Object.keys(status ?? {});
    expect(keys).not.toContain("password");
    expect(keys).not.toContain("ipAddress");
    expect(keys).not.toContain("inviteCode");
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(JSON.stringify(status)).not.toContain('"p1"');
  });

  it("carries the 24h player history as counts only — no names, no join timestamps", async () => {
    bag.server = {
      id: "s1", name: "My Server", game: "MINECRAFT", status: "STOPPED",
      port: 25565, ramAllocation: 4, definitionId: "def1", statusShareCode: "abc12345",
      plannedSessions: [],
    };
    bag.telemetryRows = [
      { createdAt: new Date(NOW.getTime() - 2 * HISTORY_BUCKET_MS), playerCount: 12 },
      { createdAt: new Date(NOW.getTime() - 1 * HISTORY_BUCKET_MS), playerCount: 4 },
    ];
    const status = await getPublicStatus("abc12345", { now: NOW, dig });
    expect(status?.history).toHaveLength(2);
    expect(status?.history[0]).toMatchObject({ n: 12 });
    expect(status?.weekly).toHaveLength(7);
    expect(status?.weekly[0]).toHaveLength(24);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("password");
    // Only the two numbers and bucket-start ISO stamps ride along
    expect(serialized?.match(/"n":/g)).toHaveLength(2);
  });

  it("never queries the game for a stopped server", async () => {
    bag.server = {
      id: "s1", name: "My Server", game: "MINECRAFT", status: "STOPPED",
      port: 25565, ramAllocation: 4, definitionId: "def1", statusShareCode: "abc12345",
      plannedSessions: [],
    };
    const status = await getPublicStatus("abc12345", { now: NOW, dig });
    expect(status?.players).toBeNull();
    expect(dig).not.toHaveBeenCalled();
  });

  it("reports null counts (not an error) when the game definition is missing", async () => {
    bag.server = {
      id: "s1", name: "My Server", game: "UNKNOWNGAME", status: "RUNNING",
      port: 25565, ramAllocation: 4, definitionId: null, statusShareCode: "abc12345",
      plannedSessions: [],
    };
    bag.def = null;
    const status = await getPublicStatus("abc12345", { now: NOW, dig });
    expect(status?.players).toBeNull();
    expect(status?.status).toBe("RUNNING");
  });

  it("caches per code so a shared link can't hammer the game server", async () => {
    bag.server = {
      id: "s1", name: "My Server", game: "MINECRAFT", status: "RUNNING",
      port: 25565, ramAllocation: 4, definitionId: "def1", statusShareCode: "abc12345",
      plannedSessions: [],
    };
    await getPublicStatus("abc12345", { now: NOW, dig });
    await getPublicStatus("abc12345", { now: NOW, dig });
    expect(bag.serverQueries).toBe(1);
    expect(dig).toHaveBeenCalledTimes(1);

    clearStatusCache();
    await getPublicStatus("abc12345", { now: NOW, dig });
    expect(bag.serverQueries).toBe(2);
  });
});
