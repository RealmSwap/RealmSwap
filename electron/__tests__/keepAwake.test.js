import { describe, it, expect, vi, beforeEach } from "vitest";
import { createKeepAwake, BLOCKER_TYPE } from "../keepAwake.js";

// The desktop shell's half of keep-awake: relay the dashboard's decision to
// the OS power-save blocker, and fail toward letting the PC sleep.

function harness(over = {}) {
  const state = { decision: { keepAwake: false, reasons: [] }, fail: false, started: [], stopped: [], tick: null, cleared: 0 };
  let nextId = 1;
  const controller = createKeepAwake({
    fetchDecision: async () => {
      if (state.fail) throw new Error("dashboard down");
      return state.decision;
    },
    blocker: {
      start: (type) => {
        state.started.push(type);
        return nextId++;
      },
      stop: (id) => state.stopped.push(id),
    },
    setTimer: (fn) => {
      state.tick = fn;
      return "timer";
    },
    clearTimer: () => {
      state.cleared += 1;
    },
    maxFailures: 3,
    ...over,
  });
  return { controller, state };
}

describe("createKeepAwake", () => {
  let h;
  beforeEach(() => {
    h = harness();
  });

  it("holds the PC awake when the dashboard says so, exactly once", async () => {
    h.state.decision = { keepAwake: true, reasons: ["3 players on Srv"] };
    await h.controller.pollNow();
    await h.controller.pollNow();
    expect(h.state.started).toEqual([BLOCKER_TYPE]);
    expect(h.controller.isHolding()).toBe(true);
  });

  it("releases when nothing needs the PC awake any more", async () => {
    h.state.decision = { keepAwake: true, reasons: [] };
    await h.controller.pollNow();
    h.state.decision = { keepAwake: false, reasons: [] };
    await h.controller.pollNow();
    expect(h.state.stopped).toEqual([1]);
    expect(h.controller.isHolding()).toBe(false);
  });

  it("uses the blocker that keeps the system up but lets the display sleep", () => {
    expect(BLOCKER_TYPE).toBe("prevent-app-suspension");
  });

  it("rides out a couple of failed lookups without dropping the hold mid-game", async () => {
    h.state.decision = { keepAwake: true, reasons: [] };
    await h.controller.pollNow();
    h.state.fail = true;
    await h.controller.pollNow();
    await h.controller.pollNow();
    expect(h.controller.isHolding()).toBe(true);
  });

  it("lets the PC sleep once the dashboard has stopped answering", async () => {
    h.state.decision = { keepAwake: true, reasons: [] };
    await h.controller.pollNow();
    h.state.fail = true;
    for (let i = 0; i < 3; i++) await h.controller.pollNow();
    expect(h.controller.isHolding()).toBe(false);
    expect(h.state.stopped).toEqual([1]);
  });

  it("a good answer resets the failure count", async () => {
    h.state.decision = { keepAwake: true, reasons: [] };
    await h.controller.pollNow();
    h.state.fail = true;
    await h.controller.pollNow();
    await h.controller.pollNow();
    h.state.fail = false;
    await h.controller.pollNow();
    h.state.fail = true;
    await h.controller.pollNow();
    await h.controller.pollNow();
    expect(h.controller.isHolding()).toBe(true);
  });

  it("start() checks immediately and then on the timer; stop() releases", async () => {
    h.state.decision = { keepAwake: true, reasons: [] };
    h.controller.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.controller.isHolding()).toBe(true);
    expect(typeof h.state.tick).toBe("function");

    h.controller.stop();
    expect(h.state.cleared).toBe(1);
    expect(h.controller.isHolding()).toBe(false);
  });

  it("coalesces overlapping checks", async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const slow = harness({
      fetchDecision: async () => {
        calls += 1;
        await gate;
        return { keepAwake: false, reasons: [] };
      },
    });
    const first = slow.controller.pollNow();
    const second = slow.controller.pollNow();
    release();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
  });

  it("logs transitions with the reasons, so startup.log explains why the PC stayed on", async () => {
    const lines = [];
    const logged = harness({ log: (line) => lines.push(line) });
    logged.state.decision = { keepAwake: true, reasons: ["Game night \"Friday\" on Srv"] };
    await logged.controller.pollNow();
    logged.state.decision = { keepAwake: false, reasons: [] };
    await logged.controller.pollNow();
    expect(lines[0]).toMatch(/keep-awake on: Game night "Friday" on Srv/);
    expect(lines[1]).toMatch(/keep-awake off/);
  });
});
