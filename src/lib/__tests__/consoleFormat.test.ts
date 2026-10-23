import { describe, it, expect } from "vitest";
import {
  classifyLogLevel,
  looksTimestamped,
  stampUntimestampedLines,
  highlightSegments,
} from "@/lib/consoleFormat";

describe("classifyLogLevel", () => {
  it("flags game and manager error lines", () => {
    expect(classifyLogLevel("[12:34:56] [Server thread/ERROR]: Can't keep up!")).toBe("error");
    expect(classifyLogLevel("Exception in thread \"main\" java.lang.OutOfMemoryError")).toBe("error");
    expect(classifyLogLevel("[Crash Detection] Server crashed with exit code 1")).toBe("error");
    expect(classifyLogLevel("[Docker] Failed to start container: no image")).toBe("error");
    expect(classifyLogLevel("SEVERE: world save failed")).toBe("error");
    // Known trade-off: count summaries are keyword-classified too.
    expect(classifyLogLevel("0 errors")).toBe("error");
  });

  it("flags warning lines", () => {
    expect(classifyLogLevel("[12:34:56] [Server thread/WARN]: Deprecated method")).toBe("warn");
    expect(classifyLogLevel("Auto-restarting in 5 seconds...")).toBe("warn");
    expect(classifyLogLevel("Login timed out for player Bob")).toBe("warn");
    expect(classifyLogLevel("2 warnings encountered")).toBe("warn");
  });

  it("leaves ordinary lines as info, including lookalike identifiers", () => {
    expect(classifyLogLevel("[12:34:56] [Server thread/INFO]: Done (3.2s)!")).toBe("info");
    expect(classifyLogLevel("Preparing level \"world\"")).toBe("info");
    // Adjacent identifier letters are not a level word.
    expect(classifyLogLevel("errorLevel = 0")).toBe("info");
  });
});

describe("looksTimestamped", () => {
  it("recognizes the shapes games and RealmSwap emit", () => {
    expect(looksTimestamped("[12:34:56] [Server thread/INFO]: Done")).toBe(true);
    expect(looksTimestamped("12:34:56 plain ts")).toBe(true);
    expect(looksTimestamped("2026-10-23T09:00:00 iso")).toBe(true);
    expect(looksTimestamped("[2026-10-23 09:00:00] bracketed")).toBe(true);
    expect(looksTimestamped("2026.10.23-09.00.12: ARK style")).toBe(true);
  });

  it("does not mistake ordinary leading numbers or tags for timestamps", () => {
    expect(looksTimestamped("[Crash Detection] Server crashed")).toBe(false);
    expect(looksTimestamped("5 players online")).toBe(false);
    expect(looksTimestamped("10:30 map rotation starts soon")).toBe(false); // HH:MM is not HH:MM:SS
  });
});

describe("stampUntimestampedLines", () => {
  const now = new Date(2026, 9, 23, 14, 5, 9);

  it("stamps manager lines and leaves timestamped lines alone", () => {
    expect(stampUntimestampedLines("[Docker] Container started", now)).toBe(
      "[14:05:09] [Docker] Container started"
    );
    expect(stampUntimestampedLines("[12:00:00] [Server thread/INFO]: Done", now)).toBe(
      "[12:00:00] [Server thread/INFO]: Done"
    );
  });

  it("handles multi-line chunks per line and leaves blanks unstamped", () => {
    expect(stampUntimestampedLines("manager line\n[13:00:00] game line\n\nsecond manager line", now)).toBe(
      "[14:05:09] manager line\n[13:00:00] game line\n\n[14:05:09] second manager line"
    );
  });
});

describe("highlightSegments", () => {
  it("returns one plain segment without a query", () => {
    expect(highlightSegments("any line", "")).toEqual([{ text: "any line", match: false }]);
    expect(highlightSegments("any line", "   ")).toEqual([{ text: "any line", match: false }]);
  });

  it("splits case-insensitively around every match", () => {
    expect(highlightSegments("ERROR in Error handler", "error")).toEqual([
      { text: "ERROR", match: true },
      { text: " in ", match: false },
      { text: "Error", match: true },
      { text: " handler", match: false },
    ]);
  });

  it("returns the whole line when nothing matches", () => {
    expect(highlightSegments("all quiet", "warn")).toEqual([{ text: "all quiet", match: false }]);
  });
});
