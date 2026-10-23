import { describe, it, expect } from "vitest";
import { summarizePlannedSession, formatSessionStart } from "../sessions";

describe("summarizePlannedSession", () => {
  it("counts the roster without shipping Discord IDs to the client", () => {
    const summary = summarizePlannedSession({
      id: "ps1",
      title: "Raid Night",
      startTime: new Date("2026-10-24T18:00:00Z"),
      roster: JSON.stringify(["111", "222", "333", "444"]),
    });

    expect(summary).toEqual({
      id: "ps1",
      title: "Raid Night",
      startTime: "2026-10-24T18:00:00.000Z",
      rosterCount: 4,
    });
    expect(JSON.stringify(summary)).not.toContain("111");
  });

  it("shows a corrupt roster honestly as 0 in", () => {
    const summary = summarizePlannedSession({
      id: "ps2",
      title: "Session",
      startTime: new Date("2026-10-24T18:00:00Z"),
      roster: "not-json",
    });
    expect(summary.rosterCount).toBe(0);
  });

  it("treats a non-array roster as empty", () => {
    const summary = summarizePlannedSession({
      id: "ps3",
      title: "Session",
      startTime: new Date("2026-10-24T18:00:00Z"),
      roster: JSON.stringify({ user: "x" }),
    });
    expect(summary.rosterCount).toBe(0);
  });
});

describe("formatSessionStart", () => {
  it("labels today as Today", () => {
    const later = new Date();
    later.setHours(later.getHours() + 2);
    expect(formatSessionStart(later.toISOString())).toMatch(/^Today /);
  });

  it("labels tomorrow as Tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.toDateString() === new Date().toDateString()) return; // DST edge — skip
    expect(formatSessionStart(tomorrow.toISOString())).toMatch(/^Tomorrow /);
  });

  it("labels further out with the weekday", () => {
    const nextWeek = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const out = formatSessionStart(nextWeek.toISOString());
    expect(out).not.toMatch(/^(Today|Tomorrow) /);
    expect(out.length).toBeGreaterThan(0);
  });
});
