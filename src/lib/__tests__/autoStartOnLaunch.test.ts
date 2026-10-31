import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Dedicated-box launch auto-start. The runner chain, DB, and tunnels are
 * boundary-mocked; claim/release is the REAL in-memory claim map (the same
 * one the start route uses), so claim-held behavior is proven end to end.
 */

const bag = vi.hoisted(() => ({
  servers: [] as any[],
  fresh: null as any,
  freshFor: null as null | ((args: any) => any),
  updatesCount: {} as Record<string, number>,
  starts: [] as string[],
  startError: null as null | ((id: string) => Error | null),
  audits: [] as any[],
  statusResets: [] as any[],
  tunnelsStarted: [] as string[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    server: {
      findMany: async () => bag.servers,
      findUnique: async (args: any) => (bag.freshFor ? bag.freshFor(args) : bag.fresh),
      update: async (args: any) => {
        bag.statusResets.push(args);
        return {};
      },
    },
    activityLog: {
      create: async (args: any) => {
        bag.audits.push(args.data);
        return {};
      },
    },
  },
}));
vi.mock("@/lib/runners", () => ({
  getRunner: () => ({
    update: async (server: any) => {
      bag.updatesCount[server.id] = (bag.updatesCount[server.id] ?? 0) + 1;
      if (bag.startError?.(server.id)) throw bag.startError(server.id);
    },
    start: async (server: any) => {
      if (bag.startError?.(server.id)) throw bag.startError(server.id);
      bag.starts.push(server.id);
    },
  }),
}));
vi.mock("@/lib/tunnels", () => ({
  startTunnel: async (serverId: string) => {
    bag.tunnelsStarted.push(serverId);
    return { ok: true as const };
  },
}));

import { autoStartServersOnLaunch } from "../autoStartOnLaunch";
import { claimStart, releaseStart } from "@/lib/runners/startClaims";

const baseServer = (over: Partial<any> = {}) => ({
  id: "s1", name: "Box", game: "MINECRAFT", runnerType: "LOCAL",
  autoStartOnLaunch: true, status: "STOPPED", autoUpdate: false,
  tunnelEnabled: false, userId: 1, ...over,
});

beforeEach(() => {
  bag.servers = [baseServer()];
  bag.fresh = baseServer();
  bag.freshFor = null;
  bag.updatesCount = {};
  bag.starts = [];
  bag.startError = null;
  bag.audits = [];
  bag.statusResets = [];
  bag.tunnelsStarted = [];
  releaseStart("s1");
  releaseStart("s2");
});

describe("autoStartServersOnLaunch", () => {
  it("starts a flagged stopped server and audits it", async () => {
    const result = await autoStartServersOnLaunch();

    expect(result.started).toEqual(["s1"]);
    expect(result.failed).toEqual([]);
    expect(bag.starts).toEqual(["s1"]);
    expect(bag.audits).toHaveLength(1);
    expect(bag.audits[0]).toMatchObject({ action: "AUTO_START_SERVER", serverId: "s1", userId: 1 });
    expect(bag.tunnelsStarted).toEqual([]);
  });

  it("skips servers whose fresh status is no longer STOPPED (busy guard)", async () => {
    bag.fresh = baseServer({ status: "STARTING" });

    const result = await autoStartServersOnLaunch();
    expect(result.started).toEqual([]);
    expect(bag.starts).toEqual([]);
  });

  it("skips a server whose start claim is already held (start/update in flight)", async () => {
    expect(claimStart("s1")).toBe(true);
    const result = await autoStartServersOnLaunch();
    releaseStart("s1");

    expect(result.started).toEqual([]);
    expect(bag.starts).toEqual([]);
  });

  it("runs update-then-start for autoUpdate non-Minecraft servers", async () => {
    bag.servers = [baseServer({ game: "VALHEIM", autoUpdate: true })];
    bag.fresh = bag.servers[0];

    const result = await autoStartServersOnLaunch();
    expect(result.started).toEqual(["s1"]);
    expect(bag.updatesCount["s1"]).toBe(1);
    expect(bag.starts).toEqual(["s1"]);
  });

  it("starts the tunnel after the server when one is enabled", async () => {
    bag.servers = [baseServer({ tunnelEnabled: true })];
    bag.fresh = bag.servers[0];

    await autoStartServersOnLaunch();
    expect(bag.tunnelsStarted).toEqual(["s1"]);
  });

  it("one failing server resets to STOPPED and never blocks the others", async () => {
    bag.servers = [baseServer({ id: "s1" }), baseServer({ id: "s2", name: "Box 2" })];
    bag.startError = (id) => (id === "s1" ? new Error("port taken") : null);
    // findUnique answers per id so each server passes the busy guard.
    bag.freshFor = (args) => baseServer({ id: args.where.id, name: args.where.id === "s1" ? "Box" : "Box 2" });

    const result = await autoStartServersOnLaunch();
    expect(result.started).toEqual(["s2"]);
    expect(result.failed).toEqual([{ serverId: "s1", error: "port taken" }]);
    expect(bag.statusResets[0]).toMatchObject({ where: { id: "s1" } });
    expect(bag.statusResets[0].data.status).toBe("STOPPED");
    expect(bag.starts).toEqual(["s2"]);
  });

  it("a failed start releases the claim (a later pass can retry)", async () => {
    bag.startError = () => new Error("nope");
    await autoStartServersOnLaunch();
    bag.startError = null;

    expect(claimStart("s1")).toBe(true);
    releaseStart("s1");
  });
});
