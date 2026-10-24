import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPublicStatus, nextSessionFrom, clearStatusCache } from "../statusShare";

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
  dig.mockClear();
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

    // Leak guards: the payload must not even have fields for secrets.
    const keys = Object.keys(status ?? {});
    expect(keys).not.toContain("password");
    expect(keys).not.toContain("ipAddress");
    expect(keys).not.toContain("inviteCode");
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(JSON.stringify(status)).not.toContain('"p1"');
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
