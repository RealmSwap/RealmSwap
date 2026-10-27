import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  beginProgress, emitProgress, subscribeProgress, endProgress, resetProgress, type ModProgressEvent,
} from "../progress";

describe("mod install progress hub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetProgress();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetProgress();
  });

  it("merges partial events into the session state and fans them out", () => {
    beginProgress("abc123");
    const seen: ModProgressEvent[] = [];
    subscribeProgress("abc123", (e) => seen.push(e));

    emitProgress("abc123", { stage: "mods", current: 0, total: 10, bytesTotal: 5000 });
    emitProgress("abc123", { current: 3, bytesDone: 1200 });
    emitProgress("abc123", { label: "cool-mod.jar" });

    // catch-up frame + 3 updates
    expect(seen).toHaveLength(4);
    expect(seen[0]).toEqual({ stage: "resolving" });
    expect(seen[3]).toEqual({ stage: "mods", current: 3, total: 10, bytesTotal: 5000, bytesDone: 1200, label: "cool-mod.jar" });
  });

  it("replays current state to a late subscriber (catch-up)", () => {
    beginProgress("late01");
    emitProgress("late01", { stage: "loader", label: "Installing NeoForge", current: 0, total: 1 });

    const seen: ModProgressEvent[] = [];
    subscribeProgress("late01", (e) => seen.push(e));
    expect(seen).toEqual([{ stage: "loader", label: "Installing NeoForge", current: 0, total: 1 }]);
  });

  it("returns null for unknown sessions and ignores emits to them", () => {
    expect(subscribeProgress("nope00", () => {})).toBeNull();
    expect(emitProgress("nope00", { stage: "mods" })).toBeNull();
  });

  it("delivers the terminal event then drops the session after the grace window", () => {
    beginProgress("term01");
    const seen: ModProgressEvent[] = [];
    subscribeProgress("term01", (e) => seen.push(e));

    endProgress("term01", "error", "boom");
    expect(seen.at(-1)).toEqual({ stage: "error", error: "boom" });

    // Still subscribable during the grace window (SSE clients draining).
    expect(subscribeProgress("term01", () => {})).not.toBeNull();
    vi.advanceTimersByTime(10_001);
    expect(subscribeProgress("term01", () => {})).toBeNull();
  });

  it("a throwing subscriber never breaks the emitter or its siblings", () => {
    beginProgress("thr001");
    const good: ModProgressEvent[] = [];
    subscribeProgress("thr001", () => { throw new Error("client gone"); });
    subscribeProgress("thr001", (e) => good.push(e));
    expect(() => emitProgress("thr001", { stage: "boot" })).not.toThrow();
    expect(good.at(-1)?.stage).toBe("boot");
  });

  it("unsubscribe stops delivery", () => {
    beginProgress("unsub1");
    const seen: ModProgressEvent[] = [];
    const off = subscribeProgress("unsub1", (e) => seen.push(e))!;
    off();
    emitProgress("unsub1", { stage: "mods" });
    expect(seen).toHaveLength(1); // only the catch-up frame
  });

  it("sweeps abandoned (never-ended) sessions after 30 minutes", () => {
    beginProgress("stale1");
    vi.advanceTimersByTime(31 * 60_000);
    beginProgress("fresh1"); // sweep runs on begin
    expect(subscribeProgress("stale1", () => {})).toBeNull();
    expect(subscribeProgress("fresh1", () => {})).not.toBeNull();
  });
});
