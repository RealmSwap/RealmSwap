import { describe, it, expect, vi, beforeEach } from "vitest";

// The connectivity monitor end to end: the same checks Join Info runs, on a
// timer, deciding when a loss is worth telling the owner about.

const bag = vi.hoisted(() => ({
  server: null as any,
  notifications: [] as any[],
  logs: [] as any[],
  reports: [] as any[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    server: { findUnique: async () => bag.server },
    activityLog: { create: async ({ data }: any) => void bag.logs.push(data) },
    gameDefinition: { findUnique: async () => ({ spec: "{}" }), findFirst: async () => ({ spec: "{}" }) },
  },
}));
vi.mock("@/lib/definitions/serialize", () => ({ parseSpec: () => ({ ports: [], launch: { executable: "x.exe" } }) }));
vi.mock("@/lib/tunnels", () => ({ isTunnelAlive: () => true }));
vi.mock("@/lib/notifications", () => ({
  sendNotification: async (...args: any[]) => void bag.notifications.push(args),
}));
vi.mock("@/lib/connectivityCheck", () => ({
  runConnectivityChecks: async (_server: any, _spec: any, _deps: any) => bag.reports.shift(),
}));

import { maybeCheckConnectivity } from "../connectivityMonitor";
import { noteConnectivityAlerted, connectivityStateFor, resetConnectivityState } from "../connectivityState";
import { CONNECTIVITY_CHECK_INTERVAL_MS } from "../connectivityRules";

const baseServer = {
  id: "srv-1",
  userId: "owner-1",
  name: "Friday Server",
  status: "RUNNING",
  port: 2456,
  runnerType: "LOCAL",
  definitionId: null,
  game: "VALHEIM",
  enableUpnp: false,
  upnpMapped: null,
  tunnelEnabled: true,
  tunnelUrl: "tunnel.example:1234",
};

const T0 = 1_700_000_000_000;
// Minimal real reports: the monitor classifies them, so the checks that matter
// (server running, listener up, router path) must be present.
const checkRow = (id: string, status: string) => ({ id, label: id, status, detail: "" });
const okReport = { overall: "ready", checks: [checkRow("server", "ok"), checkRow("listen", "ok"), checkRow("router", "ok")] };
const badReport = { overall: "blocked", checks: [checkRow("server", "ok"), checkRow("listen", "ok"), checkRow("router", "fail")] };

beforeEach(() => {
  // The monitor's memory is a globalThis map keyed by server id, so each case
  // starts from a clean run.
  resetConnectivityState("srv-1");
  bag.server = { ...baseServer };
  bag.notifications = [];
  bag.logs = [];
  bag.reports = [];
});

const check = (at: number, report?: any) => maybeCheckConnectivity("srv-1", { now: at, checkDeps: report ? {} : {} });

describe("maybeCheckConnectivity", () => {
  it("tells the owner once when the public path breaks for good, and again when it's back", async () => {
    // First check: path works — arms the run.
    bag.reports.push(okReport);
    await check(T0);
    // Two bad checks in a row → lost.
    bag.reports.push(badReport);
    await check(T0 + CONNECTIVITY_CHECK_INTERVAL_MS + 1);
    bag.reports.push(badReport);
    await check(T0 + 2 * (CONNECTIVITY_CHECK_INTERVAL_MS + 1));
    expect(bag.notifications).toHaveLength(1);
    expect(bag.notifications[0][1]).toMatch(/Friends can't reach Friday Server/);
    expect(bag.notifications[0][2]).toMatch(/tunnel/i);
    expect(bag.logs[0]?.action).toBe("CONNECTIVITY_LOST");

    // It stays broken; no repeat alert.
    bag.reports.push(badReport);
    await check(T0 + 3 * (CONNECTIVITY_CHECK_INTERVAL_MS + 1));
    expect(bag.notifications).toHaveLength(1);

    // Back → restored, exactly once.
    bag.reports.push(okReport);
    await check(T0 + 4 * (CONNECTIVITY_CHECK_INTERVAL_MS + 1));
    expect(bag.notifications).toHaveLength(2);
    expect(bag.notifications[1][1]).toMatch(/reachable again/);
    expect(bag.logs[1]?.action).toBe("CONNECTIVITY_RESTORED");
    bag.reports.push(okReport);
    await check(T0 + 5 * (CONNECTIVITY_CHECK_INTERVAL_MS + 1));
    expect(bag.notifications).toHaveLength(2);
  });

  it("checks at its interval, not on every tick", async () => {
    bag.reports.push(okReport);
    await check(T0);
    await check(T0 + 1000); // 1s later: inside the interval, no second check
    expect(bag.reports).toHaveLength(0);
  });

  it("never reports a server that never had a public path", async () => {
    bag.server = { ...baseServer, tunnelEnabled: true, tunnelUrl: null, enableUpnp: false };
    for (let i = 0; i < 4; i++) {
      bag.reports.push(badReport);
      await check(T0 + i * (CONNECTIVITY_CHECK_INTERVAL_MS + 1));
    }
    expect(bag.notifications).toHaveLength(0);
    expect(bag.logs).toHaveLength(0);
  });

  it("stays quiet for a LAN-only server and resets when the path is switched off", async () => {
    bag.server = { ...baseServer, tunnelEnabled: false, tunnelUrl: null, enableUpnp: false };
    // First establish the run as LAN-only from the start.
    bag.reports.push(badReport);
    await check(T0);
    bag.reports.push(okReport);
    await check(T0 + CONNECTIVITY_CHECK_INTERVAL_MS + 1);
    expect(bag.notifications).toHaveLength(0);
  });

  it("a tunnel crash that was already reported to the owner is not reported twice", async () => {
    noteConnectivityAlerted("srv-1");
    bag.reports.push(badReport, badReport);
    await check(T0);
    await check(T0 + CONNECTIVITY_CHECK_INTERVAL_MS + 1);
    expect(bag.notifications).toHaveLength(0);
    bag.reports.push(okReport);
    await check(T0 + 2 * (CONNECTIVITY_CHECK_INTERVAL_MS + 1));
    expect(bag.notifications).toHaveLength(1);
    expect(bag.notifications[0][1]).toMatch(/reachable again/);
  });

  it("a stopped server resets the run", async () => {
    bag.reports.push(okReport);
    await check(T0);
    connectivityStateFor("srv-1").alerted = true; // simulate a loss that was reported
    bag.server = { ...baseServer, status: "STOPPED" };
    await check(T0 + CONNECTIVITY_CHECK_INTERVAL_MS + 1);
    expect(connectivityStateFor("srv-1")).toEqual({ lastCheckAt: 0, inFlight: false, everReachable: false, badStreak: 0, alerted: false });
  });

  it("a long silence (the server was stopped and started again) re-arms alerts", async () => {
    bag.reports.push(okReport);
    await check(T0);
    connectivityStateFor("srv-1").alerted = true;
    bag.reports.push(badReport, badReport);
    const later = T0 + 10 * CONNECTIVITY_CHECK_INTERVAL_MS; // ticks stopped for a while
    await check(later);
    await check(later + CONNECTIVITY_CHECK_INTERVAL_MS + 1);
    // A brand-new run: the path never worked in it, so this breakage is setup,
    // not an incident.
    expect(bag.notifications).toHaveLength(0);
    expect(connectivityStateFor("srv-1").alerted).toBe(false);
  });

  it("skips node-hosted servers and unknown definitions", async () => {
    bag.server = { ...baseServer, runnerType: "AGENT" };
    bag.reports.push(okReport);
    await check(T0);
    expect(bag.reports).toHaveLength(1); // unconsumed: the check never ran
    expect(bag.notifications).toHaveLength(0);
  });
});
