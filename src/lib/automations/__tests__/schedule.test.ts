import { describe, it, expect } from "vitest";
import { computeNextRunAt, expandOccurrences, TRIGGER_TYPES, SCHEDULED_TRIGGER_TYPES } from "../schedule";

// Every computation passes an explicit `from` — deterministic regardless of
// when the suite runs. 2026-10-23 is a Friday.
const from = new Date(2026, 9, 23, 10, 0, 0, 0);
const expected = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m, d, h, min, 0, 0).getTime();

describe("computeNextRunAt", () => {
  it("CRON: next occurrence after `from`", () => {
    expect(computeNextRunAt("CRON", { cronExpression: "0 15 * * *" }, from)!.getTime())
      .toBe(expected(2026, 9, 23, 15));
    expect(computeNextRunAt("CRON", { cronExpression: "0 4 * * *" }, from)!.getTime())
      .toBe(expected(2026, 9, 24, 4));
  });

  it("CRON: missing or garbage expression throws", () => {
    expect(() => computeNextRunAt("CRON", {}, from)).toThrow(/cronExpression/);
    expect(() => computeNextRunAt("CRON", { cronExpression: "not cron" }, from)).toThrow(/valid cron/);
  });

  it("DAILY: later today, else tomorrow", () => {
    expect(computeNextRunAt("DAILY", { timeOfDay: "14:30" }, from)!.getTime())
      .toBe(expected(2026, 9, 23, 14, 30));
    expect(computeNextRunAt("DAILY", { timeOfDay: "09:30" }, from)!.getTime())
      .toBe(expected(2026, 9, 24, 9, 30));
  });

  it("DAILY: missing or malformed timeOfDay throws", () => {
    expect(() => computeNextRunAt("DAILY", {}, from)).toThrow(/timeOfDay/);
    expect(() => computeNextRunAt("DAILY", { timeOfDay: "25:00" }, from)).toThrow(/timeOfDay/);
    expect(() => computeNextRunAt("DAILY", { timeOfDay: "9am" }, from)).toThrow(/timeOfDay/);
  });

  it("WEEKLY: same weekday still ahead today, otherwise rolls forward", () => {
    // Friday(5) at 10:30 — 30 minutes ahead of `from`
    expect(computeNextRunAt("WEEKLY", { dayOfWeek: 5, timeOfDay: "10:30" }, from)!.getTime())
      .toBe(expected(2026, 9, 23, 10, 30));
    // Friday at 09:00 already passed → next Friday
    expect(computeNextRunAt("WEEKLY", { dayOfWeek: 5, timeOfDay: "09:00" }, from)!.getTime())
      .toBe(expected(2026, 9, 30, 9));
    // Monday(1) → three days ahead
    expect(computeNextRunAt("WEEKLY", { dayOfWeek: 1, timeOfDay: "10:00" }, from)!.getTime())
      .toBe(expected(2026, 9, 26, 10));
  });

  it("WEEKLY: missing dayOfWeek throws", () => {
    expect(() => computeNextRunAt("WEEKLY", { timeOfDay: "09:00" }, from)).toThrow(/dayOfWeek/);
  });

  it("MONTHLY: upcoming day this month, and skips months without the day", () => {
    expect(computeNextRunAt("MONTHLY", { dayOfMonth: 31, timeOfDay: "02:00" }, from)!.getTime())
      .toBe(expected(2026, 9, 31, 2));
    // From Oct 31 03:00 (after this month's 31st, 02:00): November has no 31st → December
    const afterOct = new Date(2026, 9, 31, 3, 0, 0, 0);
    expect(computeNextRunAt("MONTHLY", { dayOfMonth: 31, timeOfDay: "02:00" }, afterOct)!.getTime())
      .toBe(expected(2026, 11, 31, 2));
    // Day 30 from Oct 31: lands on Nov 30
    expect(computeNextRunAt("MONTHLY", { dayOfMonth: 30, timeOfDay: "02:00" }, afterOct)!.getTime())
      .toBe(expected(2026, 10, 30, 2));
  });

  it("MONTHLY: missing dayOfMonth throws", () => {
    expect(() => computeNextRunAt("MONTHLY", { timeOfDay: "02:00" }, from)).toThrow(/dayOfMonth/);
  });

  it("ONE_TIME: future runAt returned; past/missing/garbage throw", () => {
    expect(computeNextRunAt("ONE_TIME", { runAt: "2026-10-30T18:30" }, from)!.getTime())
      .toBe(expected(2026, 9, 30, 18, 30));
    expect(() => computeNextRunAt("ONE_TIME", { runAt: "2020-01-01T00:00" }, from)).toThrow(/future/);
    expect(() => computeNextRunAt("ONE_TIME", {}, from)).toThrow(/runAt/);
    expect(() => computeNextRunAt("ONE_TIME", { runAt: "garbage" }, from)).toThrow(/valid runAt/);
  });

  it("event triggers return null instead of throwing", () => {
    for (const type of ["SERVER_CRASH", "PLAYER_JOINED", "PLAYER_LEFT"] as const) {
      expect(computeNextRunAt(type, {}, from)).toBeNull();
    }
  });

  it("trigger type lists cover the full union", () => {
    expect(TRIGGER_TYPES).toHaveLength(8);
    expect([...SCHEDULED_TRIGGER_TYPES, "SERVER_CRASH", "PLAYER_JOINED", "PLAYER_LEFT"].sort())
      .toEqual([...TRIGGER_TYPES].sort());
  });
});

describe("expandOccurrences", () => {
  it("DAILY fills every day of the window, starting tomorrow when today's slot passed", () => {
    const occurrences = expandOccurrences("DAILY", { timeOfDay: "09:00" }, from, 7);
    expect(occurrences).toHaveLength(7);
    expect(occurrences[0].getTime()).toBe(expected(2026, 9, 24, 9));
    expect(occurrences[6].getTime()).toBe(expected(2026, 9, 30, 9));
  });

  it("CRON expands each day's run within the window", () => {
    const occurrences = expandOccurrences("CRON", { cronExpression: "0 4 * * *" }, from, 7);
    expect(occurrences).toHaveLength(7);
    expect(occurrences[0].getTime()).toBe(expected(2026, 9, 24, 4));
  });

  it("ONE_TIME yields a single occurrence inside the window and none outside", () => {
    expect(expandOccurrences("ONE_TIME", { runAt: "2026-10-24T09:00" }, from, 7)).toHaveLength(1);
    expect(expandOccurrences("ONE_TIME", { runAt: "2026-12-24T09:00" }, from, 7)).toHaveLength(0);
  });

  it("WEEKLY lands once inside a 7-day window", () => {
    const occurrences = expandOccurrences("WEEKLY", { dayOfWeek: 5, timeOfDay: "10:30" }, from, 7);
    expect(occurrences.map(o => o.getTime())).toEqual([expected(2026, 9, 23, 10, 30)]);
  });

  it("event triggers and invalid configs expand to nothing", () => {
    expect(expandOccurrences("SERVER_CRASH", {}, from, 7)).toEqual([]);
    expect(expandOccurrences("DAILY", {}, from, 7)).toEqual([]);
  });
});
