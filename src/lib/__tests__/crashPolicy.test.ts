import { describe, it, expect } from "vitest";
import {
  isCrashExit,
  evaluateCrash,
  CRASH_MAX_RETRIES,
  CRASH_WINDOW_MS,
} from "../crashPolicy";

describe("isCrashExit", () => {
  it("is false for an intentional stop regardless of exit code", () => {
    expect(isCrashExit(true, 1)).toBe(false);
    expect(isCrashExit(true, null)).toBe(false);
  });

  it("is false for a clean exit (code 0)", () => {
    expect(isCrashExit(false, 0)).toBe(false);
  });

  it("is false when there is no exit code (signal kill)", () => {
    expect(isCrashExit(false, null)).toBe(false);
  });

  it("is true for an unintentional non-zero exit", () => {
    expect(isCrashExit(false, 1)).toBe(true);
    expect(isCrashExit(false, 137)).toBe(true);
  });
});

describe("evaluateCrash", () => {
  it("starts a fresh counter on the first crash and allows a restart", () => {
    const d = evaluateCrash(undefined, 1000);
    expect(d.counter).toEqual({ count: 1, windowStart: 1000 });
    expect(d.shouldRestart).toBe(true);
    expect(d.exhausted).toBe(false);
  });

  it("accumulates crashes within the window, keeping the original windowStart", () => {
    const d = evaluateCrash({ count: 1, windowStart: 1000 }, 2000);
    expect(d.counter).toEqual({ count: 2, windowStart: 1000 });
    expect(d.shouldRestart).toBe(true);
    expect(d.exhausted).toBe(false);
  });

  it("exhausts retries once the count reaches CRASH_MAX_RETRIES", () => {
    const d = evaluateCrash({ count: 2, windowStart: 1000 }, 3000);
    expect(d.counter).toEqual({ count: 3, windowStart: 1000 });
    expect(d.shouldRestart).toBe(false);
    expect(d.exhausted).toBe(true);
  });

  it("does not reset at exactly the window boundary", () => {
    const d = evaluateCrash({ count: 1, windowStart: 1000 }, 1000 + CRASH_WINDOW_MS);
    expect(d.counter).toEqual({ count: 2, windowStart: 1000 });
  });

  it("resets the counter once the window has fully elapsed", () => {
    const now = 1000 + CRASH_WINDOW_MS + 1;
    const d = evaluateCrash({ count: 3, windowStart: 1000 }, now);
    expect(d.counter).toEqual({ count: 1, windowStart: now });
    expect(d.shouldRestart).toBe(true);
    expect(d.exhausted).toBe(false);
  });

  it("honors custom maxRetries/windowMs options", () => {
    const d = evaluateCrash({ count: 1, windowStart: 0 }, 50, {
      maxRetries: 2,
      windowMs: 100,
    });
    expect(d.counter).toEqual({ count: 2, windowStart: 0 });
    expect(d.exhausted).toBe(true);
  });

  it("exposes the production constants", () => {
    expect(CRASH_MAX_RETRIES).toBe(3);
    expect(CRASH_WINDOW_MS).toBe(10 * 60 * 1000);
  });
});
