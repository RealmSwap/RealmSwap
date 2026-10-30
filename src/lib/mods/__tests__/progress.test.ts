import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  beginProgress, emitProgress, subscribeProgress, endProgress, resetProgress,
  createBootLogEmitter, type ModProgressEvent,
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

describe("boot log emitter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetProgress();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetProgress();
  });

  it("emits a throttled rolling tail of boot lines to the session", () => {
    beginProgress("boot01");
    const seen: ModProgressEvent[] = [];
    subscribeProgress("boot01", (e) => seen.push(e));

    const onLine = createBootLogEmitter("boot01", { intervalMs: 800 });
    for (let i = 1; i <= 12; i++) onLine(`[12:00:${String(i).padStart(2, "0")}] Server line ${i}`);
    // Nothing yet — the first flush waits one interval.
    expect(seen).toHaveLength(1); // catch-up only
    vi.advanceTimersByTime(800);
    const frame = seen.at(-1)!;
    expect(frame.stage).toBe("resolving"); // merged into session state
    expect(frame.bootLines).toEqual([
      "[12:00:05] Server line 5", "[12:00:06] Server line 6", "[12:00:07] Server line 7", "[12:00:08] Server line 8",
      "[12:00:09] Server line 9", "[12:00:10] Server line 10", "[12:00:11] Server line 11", "[12:00:12] Server line 12",
    ]);
  });

  it("drops blank lines and collapses consecutive repeats (progress-bar spam)", () => {
    beginProgress("boot02");
    const seen: ModProgressEvent[] = [];
    subscribeProgress("boot02", (e) => seen.push(e));

    const onLine = createBootLogEmitter("boot02", { maxLines: 4 });
    onLine("Preparing start region");
    onLine("   ");
    onLine("Preparing start region");
    onLine("Done (3.2s)!");
    vi.advanceTimersByTime(800);
    expect(seen.at(-1)?.bootLines).toEqual(["Preparing start region", "Done (3.2s)!"]);
  });

  it("no-ops without an installId", () => {
    expect(createBootLogEmitter(undefined)).toBeInstanceOf(Function);
    expect(() => createBootLogEmitter(undefined)("anything")).not.toThrow();
  });
});
