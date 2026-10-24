import { describe, it, expect } from "vitest";
import { evaluateAutoStop, PLAYER_SAMPLE_INTERVAL_MS } from "../autoStopRules";

/**
 * The auto-stop planner. The contract that matters: a query that didn't
 * answer can NEVER prove the server is empty (fail-open), and the empty
 * streak is measured in 5-minute samples.
 */

const NOW = new Date("2026-10-23T20:00:00Z");
const base = {
  online: true,
  players: 0,
  idleStopEnabled: false,
  idleStopMinutes: 30,
  sessionAutoStopHours: 0,
  latestSessionStartTime: null,
  emptyStreakBefore: 0,
  now: NOW,
};

describe("evaluateAutoStop", () => {
  it("never counts a failed or unsupported query as empty (fail-open)", () => {
    for (const online of [false]) {
      const v = evaluateAutoStop({ ...base, online, emptyStreakBefore: 5, idleStopEnabled: true });
      expect(v.stop).toBe(false);
      expect(v.emptyStreakAfter).toBe(0);
    }
  });

  it("resets the streak the moment a player joins", () => {
    const v = evaluateAutoStop({ ...base, players: 2, emptyStreakBefore: 4, idleStopEnabled: true });
    expect(v.stop).toBe(false);
    expect(v.emptyStreakAfter).toBe(0);
  });

  it("accumulates the streak on consecutive empty samples without stopping while disabled", () => {
    const v = evaluateAutoStop({ ...base, emptyStreakBefore: 9 });
    expect(v.stop).toBe(false);
    expect(v.emptyStreakAfter).toBe(10);
  });

  it("fires the idle stop only once the streak covers idleStopMinutes", () => {
    // 30 minutes at 5-minute samples = 6 consecutive empty samples.
    const enabled = { ...base, idleStopEnabled: true };
    expect(evaluateAutoStop({ ...enabled, emptyStreakBefore: 4 }).stop).toBe(false);
    const due = evaluateAutoStop({ ...enabled, emptyStreakBefore: 5 });
    expect(due.stop).toBe(true);
    expect(due.kind).toBe("idle");
  });

  it("rounds odd idle thresholds up to whole samples, never early", () => {
    // 12 minutes → needs 3 samples (15 min), not 2 (10 min).
    const enabled = { ...base, idleStopEnabled: true, idleStopMinutes: 12 };
    expect(evaluateAutoStop({ ...enabled, emptyStreakBefore: 1 }).stop).toBe(false);
    expect(evaluateAutoStop({ ...enabled, emptyStreakBefore: 2 }).stop).toBe(true);
  });

  it("fires the session stop when the session started N hours ago and the server is empty", () => {
    const started = new Date(NOW.getTime() - 4 * 60 * 60 * 1000);
    const v = evaluateAutoStop({
      ...base,
      sessionAutoStopHours: 4,
      latestSessionStartTime: started,
      emptyStreakBefore: 0,
    });
    expect(v.stop).toBe(true);
    expect(v.kind).toBe("session");
  });

  it("holds the session stop inside the window and when players are on", () => {
    const started = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    expect(
      evaluateAutoStop({ ...base, sessionAutoStopHours: 4, latestSessionStartTime: started }).stop
    ).toBe(false);

    const started2 = new Date(NOW.getTime() - 8 * 60 * 60 * 1000);
    expect(
      evaluateAutoStop({ ...base, sessionAutoStopHours: 4, latestSessionStartTime: started2, players: 1 }).stop
    ).toBe(false);
  });

  it("ignores session history when the toggle is off and never fires without a session", () => {
    const started = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    expect(
      evaluateAutoStop({ ...base, sessionAutoStopHours: 0, latestSessionStartTime: started }).stop
    ).toBe(false);
    expect(
      evaluateAutoStop({ ...base, sessionAutoStopHours: 4, latestSessionStartTime: null }).stop
    ).toBe(false);
  });

  it("keeps counting a real empty streak even when only the session rule is armed", () => {
    const started = new Date(NOW.getTime() - 5 * 60 * 60 * 1000);
    const v = evaluateAutoStop({
      ...base,
      sessionAutoStopHours: 8,
      latestSessionStartTime: started,
      emptyStreakBefore: 1,
    });
    expect(v.stop).toBe(false);
    expect(v.emptyStreakAfter).toBe(2);
  });

  it("samples every 5 minutes — the constant the streak math depends on", () => {
    expect(PLAYER_SAMPLE_INTERVAL_MS).toBe(5 * 60 * 1000);
  });
});
