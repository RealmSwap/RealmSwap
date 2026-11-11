import { describe, it, expect, vi } from "vitest";

// Only the pure decision functions are exercised here; the modules also hold
// the DB-backed loaders.
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { decideKeepAwake, type LocalServerState } from "../keepAwake";
import { DEFAULT_POWER_SETTINGS } from "../settings";
import { activeStartWindow, nextStartToWakeFor, wakeTimeFor, WAKE_LEAD_MS, ARRIVAL_GRACE_MS, type ScheduledStart } from "../wakePlan";

const settings = (over: Partial<typeof DEFAULT_POWER_SETTINGS> = {}) => ({ ...DEFAULT_POWER_SETTINGS, ...over });
const server = (over: Partial<LocalServerState> = {}): LocalServerState => ({ name: "Srv", status: "RUNNING", playersOnline: null, ...over });

const now = new Date("2026-11-10T19:00:00");
const start = (over: Partial<ScheduledStart> = {}): ScheduledStart => ({
  dueAt: new Date(now.getTime() - 60_000),
  holdUntil: new Date(now.getTime() + 25 * 60_000),
  serverId: "s1",
  serverName: "Srv",
  source: "session",
  label: "Friday Night",
  ...over,
});

describe("decideKeepAwake", () => {
  it("holds the PC awake around a scheduled start", () => {
    const decision = decideKeepAwake({ settings: settings(), servers: [], startWindow: start() });
    expect(decision.keepAwake).toBe(true);
    expect(decision.reasons[0]).toMatch(/Game night "Friday Night" on Srv/);
  });

  it("holds it awake while players are online", () => {
    const decision = decideKeepAwake({ settings: settings(), servers: [server({ playersOnline: 3 })], startWindow: null });
    expect(decision.keepAwake).toBe(true);
    expect(decision.reasons[0]).toMatch(/3 players on Srv/);
  });

  it("holds it awake when there is no fresh player sample — never sleep under a server it can't read", () => {
    const decision = decideKeepAwake({ settings: settings(), servers: [server({ playersOnline: null })], startWindow: null });
    expect(decision.keepAwake).toBe(true);
    expect(decision.reasons[0]).toMatch(/can't tell whether anyone is on it/);
  });

  it("lets a known-empty server sleep, unless the owner asked otherwise", () => {
    const empty = [server({ playersOnline: 0 })];
    expect(decideKeepAwake({ settings: settings(), servers: empty, startWindow: null }).keepAwake).toBe(false);
    const asked = decideKeepAwake({ settings: settings({ keepAwakeWhileRunning: true }), servers: empty, startWindow: null });
    expect(asked.keepAwake).toBe(true);
    expect(asked.reasons[0]).toMatch(/is running/);
  });

  it("never lets a booting or updating server be slept through", () => {
    for (const status of ["STARTING", "UPDATING"]) {
      const decision = decideKeepAwake({ settings: settings(), servers: [server({ status, playersOnline: 0 })], startWindow: null });
      expect(decision.keepAwake).toBe(true);
    }
  });

  it("an empty-looking server that has players, with both signals, reports both", () => {
    const decision = decideKeepAwake({
      settings: settings(),
      servers: [server({ name: "A", playersOnline: 0 }), server({ name: "B", playersOnline: 2 })],
      startWindow: null,
    });
    expect(decision.keepAwake).toBe(true);
    expect(decision.reasons).toHaveLength(1);
    expect(decision.reasons[0]).toMatch(/2 players on B/);
  });

  it("the master switch overrides everything", () => {
    const decision = decideKeepAwake({ settings: settings({ keepAwake: false }), servers: [server({ playersOnline: 5 })], startWindow: start() });
    expect(decision).toEqual({ keepAwake: false, reasons: [] });
  });
});

describe("wake windows", () => {
  const future = start({ dueAt: new Date(now.getTime() + 2 * 60 * 60_000), holdUntil: new Date(now.getTime() + 2 * 60 * 60_000 + ARRIVAL_GRACE_MS) });

  it("the wake moment sits ahead of the due time", () => {
    expect(wakeTimeFor(future).getTime()).toBe(future.dueAt.getTime() - WAKE_LEAD_MS);
  });

  it("the next start worth a wake timer is the earliest whose wake moment is at least a minute away", () => {
    const soon = start({ dueAt: new Date(now.getTime() + 30_000) }); // wake moment already passed
    const later = start({ dueAt: new Date(now.getTime() + 3 * 60 * 60_000), label: "Later" });
    const picked = nextStartToWakeFor([soon, later], now);
    expect(picked?.label).toBe("Later");
  });

  it("start schedules beyond the horizon are not woken for", () => {
    const far = start({ dueAt: new Date(now.getTime() + 31 * 24 * 60 * 60_000) });
    expect(nextStartToWakeFor([far], now)).toBeNull();
  });

  it("the active window spans from the wake moment until people have had time to arrive", () => {
    const firing = start({ dueAt: new Date(now.getTime() - WAKE_LEAD_MS + 10_000) }); // just woke
    expect(activeStartWindow([firing], now)?.label).toBe("Friday Night");
    const past = start({ holdUntil: new Date(now.getTime() - 1_000) });
    expect(activeStartWindow([past, firing], now)?.label).toBe("Friday Night");
    const done = start({ dueAt: new Date(now.getTime() - 2 * 60 * 60_000), holdUntil: new Date(now.getTime() - 2 * 60 * 60_000 + ARRIVAL_GRACE_MS) });
    expect(activeStartWindow([done], now)).toBeNull();
    const notYet = start({ dueAt: new Date(now.getTime() + 60 * 60_000) });
    expect(activeStartWindow([notYet], now)).toBeNull();
  });
});
