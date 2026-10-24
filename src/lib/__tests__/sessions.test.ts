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
  // Fixed local dates — never derived from the real clock, so the test can't
  // race midnight the way the first CI run of the "Today" case did.
  const now = new Date(2026, 9, 23, 22, 0); // Fri Oct 23 2026, 10 PM local

  it("labels today as Today", () => {
    expect(formatSessionStart(new Date(2026, 9, 23, 23, 30).toISOString(), now)).toMatch(/^Today /);
  });

  it("labels tomorrow as Tomorrow", () => {
    expect(formatSessionStart(new Date(2026, 9, 24, 18, 0).toISOString(), now)).toMatch(/^Tomorrow /);
  });

  it("labels further out with the weekday", () => {
    const out = formatSessionStart(new Date(2026, 9, 30, 18, 0).toISOString(), now);
    expect(out).not.toMatch(/^(Today|Tomorrow) /);
    expect(out).toMatch(/^Fri/);
  });
});
