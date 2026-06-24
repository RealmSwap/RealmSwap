import { describe, it, expect, beforeEach } from "vitest";
import {
  parseSteamProgress,
  computePercent,
  setProgress,
  getProgress,
  clearProgress,
} from "../downloadProgress";

describe("parseSteamProgress", () => {
  it("extracts the percent from a steam download line", () => {
    expect(
      parseSteamProgress("Update state (0x61) downloading, progress: 42.66 (123 / 456)")
    ).toBeCloseTo(42.66);
  });
  it("parses an integer-valued download progress", () => {
    expect(
      parseSteamProgress("Update state (0x61) downloading, progress: 100.00 (456 / 456)")
    ).toBe(100);
  });
  it("returns null when there is no download progress token", () => {
    expect(parseSteamProgress("Logging in user ... OK")).toBeNull();
  });
  it("returns null for a malformed download progress value", () => {
    expect(parseSteamProgress("downloading, progress: abc")).toBeNull();
  });
  it("clamps download values above 100", () => {
    expect(parseSteamProgress("downloading, progress: 150.0")).toBe(100);
  });
  it("returns the LAST download value when a buffered chunk holds many", () => {
    // SteamCMD buffers stdout: one data chunk can carry the whole download history.
    const chunk =
      "Update state (0x11) preallocating, progress: 48.86 (799745692 / 1636649733) " +
      "Update state (0x61) downloading, progress: 0.70 (11534336 / 1636649733) " +
      "Update state (0x61) downloading, progress: 25.60 (419000816 / 1636649733) " +
      "Update state (0x61) downloading, progress: 72.40 (1185014383 / 1636649733)";
    expect(parseSteamProgress(chunk)).toBeCloseTo(72.4);
  });
  it("ignores preallocating progress (not a download)", () => {
    expect(
      parseSteamProgress("Update state (0x11) preallocating, progress: 48.86 (799745692 / 1636649733)")
    ).toBeNull();
  });
  it("ignores verifying progress so the bar is not relabeled during validate", () => {
    expect(
      parseSteamProgress("Update state (0x81) verifying update, progress: 95.00 (1 / 1)")
    ).toBeNull();
  });
});

describe("computePercent", () => {
  it("computes a normal ratio", () => {
    expect(computePercent(50, 200)).toBe(25);
  });
  it("returns null when total is zero", () => {
    expect(computePercent(10, 0)).toBeNull();
  });
  it("returns null when total is negative", () => {
    expect(computePercent(10, -5)).toBeNull();
  });
  it("returns null when total is not finite", () => {
    expect(computePercent(10, NaN)).toBeNull();
  });
  it("clamps when received exceeds total", () => {
    expect(computePercent(300, 200)).toBe(100);
  });
});

describe("progress store", () => {
  beforeEach(() => clearProgress("srv1"));

  it("returns null when nothing is set", () => {
    expect(getProgress("srv1")).toBeNull();
  });
  it("stores and retrieves progress", () => {
    setProgress("srv1", { phase: "steam", percent: 10, label: "Downloading 10%" });
    const p = getProgress("srv1");
    expect(p?.phase).toBe("steam");
    expect(p?.percent).toBe(10);
    expect(p?.label).toBe("Downloading 10%");
    expect(p?.updatedAt).toBeGreaterThan(0);
  });
  it("merges partial updates (keeps existing phase, overwrites percent)", () => {
    setProgress("srv1", { phase: "steam", percent: 10, label: "Downloading 10%" });
    setProgress("srv1", { percent: 55, label: "Downloading 55%" });
    const p = getProgress("srv1");
    expect(p?.phase).toBe("steam");
    expect(p?.percent).toBe(55);
    expect(p?.label).toBe("Downloading 55%");
  });
  it("stores a null percent (indeterminate)", () => {
    setProgress("srv1", { phase: "extract", percent: null, label: "Extracting…" });
    expect(getProgress("srv1")?.percent).toBeNull();
  });
  it("clears progress", () => {
    setProgress("srv1", { percent: 10 });
    clearProgress("srv1");
    expect(getProgress("srv1")).toBeNull();
  });
});
