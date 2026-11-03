import { describe, it, expect, vi } from "vitest";

// Progress hub catch-up: a subscriber that attaches mid-operation (or after
// the whole thing finished) must see the FULL frame history, not just the
// latest state — a fast machine can run an entire small-pack install between
// a client's POST and its SSE connect, and the mods-download stage would
// otherwise be invisible to the late subscriber.

import {
  beginProgress, emitProgress, endProgress, subscribeProgress, resetProgress,
} from "../progress";

describe("progress history replay", () => {
  it("replays every frame in order to a late subscriber, then live frames", () => {
    resetProgress();
    beginProgress("hist-1");
    emitProgress("hist-1", { stage: "snapshot", label: "Taking a safety snapshot" });
    emitProgress("hist-1", { stage: "mods", current: 0, total: 3 });
    emitProgress("hist-1", { stage: "mods", current: 3, total: 3 });
    emitProgress("hist-1", { stage: "boot", label: "Booting the server once" });

    const seen: string[] = [];
    const unsubscribe = subscribeProgress("hist-1", (e) => seen.push(e.stage));
    expect(seen).toEqual(["resolving", "snapshot", "mods", "mods", "boot"]);

    emitProgress("hist-1", { stage: "done" });
    expect(seen.at(-1)).toBe("done");
    unsubscribe?.();
  });

  it("delivers full history even after the session reached its terminal frame", () => {
    resetProgress();
    beginProgress("hist-2");
    emitProgress("hist-2", { stage: "mods", current: 1, total: 1 });
    endProgress("hist-2", "done");

    const seen: string[] = [];
    subscribeProgress("hist-2", (e) => seen.push(e.stage));
    expect(seen).toEqual(["resolving", "mods", "done"]);
  });

  it("bounds the replay history (cap), dropping the oldest frames", () => {
    resetProgress();
    beginProgress("hist-3");
    for (let i = 0; i < 250; i++) {
      emitProgress("hist-3", { stage: "mods", current: i, total: 250 });
    }
    const seen: string[] = [];
    subscribeProgress("hist-3", (e) => seen.push(e.stage));
    expect(seen.length).toBeLessThanOrEqual(201);
    expect(seen.at(-1)).toBe("mods");
  });

  it("a session with no emits yet delivers the initial resolving frame", () => {
    resetProgress();
    beginProgress("hist-4");
    const seen: string[] = [];
    subscribeProgress("hist-4", (e) => seen.push(e.stage));
    expect(seen).toEqual(["resolving"]);
  });
});
