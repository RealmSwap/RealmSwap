import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const bag = { deleteMany: vi.fn() };

vi.mock("@/lib/db", () => ({
  prisma: {
    get serverTelemetry() {
      return { deleteMany: bag.deleteMany };
    },
  },
}));

import {
  TELEMETRY_RETENTION_DAYS,
  telemetryCutoff,
  pruneTelemetry,
  maybePruneTelemetry,
} from "../telemetryRetention";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("telemetryRetention", () => {
  beforeEach(() => {
    bag.deleteMany.mockReset();
    bag.deleteMany.mockResolvedValue({ count: 0 });
    delete (globalThis as any).__telemetryPruneState;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retention window matches the only consumer (7-day peak-RAM hints)", () => {
    expect(TELEMETRY_RETENTION_DAYS).toBe(7);
  });

  it("pruneTelemetry deletes rows older than the cutoff and returns the count", async () => {
    bag.deleteMany.mockResolvedValue({ count: 42 });
    const now = Date.parse("2026-10-23T12:00:00Z");

    const count = await pruneTelemetry(now);

    expect(count).toBe(42);
    expect(bag.deleteMany).toHaveBeenCalledTimes(1);
    expect(bag.deleteMany.mock.calls[0][0]).toEqual({
      where: { createdAt: { lt: new Date(now - 7 * DAY_MS) } },
    });
  });

  it("telemetryCutoff is exactly now minus the retention window", () => {
    const now = Date.parse("2026-10-23T00:00:00Z");
    expect(telemetryCutoff(now).getTime()).toBe(now - 7 * DAY_MS);
  });

  // Drains the promise chain inside maybePruneTelemetry (then/catch/finally)
  // so its `running` flag actually clears before the next assertion.
  const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  it("maybePruneTelemetry runs at most once per hour", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000 * HOUR_MS);

    maybePruneTelemetry(Date.now());
    expect(bag.deleteMany).toHaveBeenCalledTimes(1);
    await flush();

    // Within the throttle window — no-op.
    vi.advanceTimersByTime(HOUR_MS - 1_000);
    maybePruneTelemetry(Date.now());
    expect(bag.deleteMany).toHaveBeenCalledTimes(1);

    // Past the window — runs again.
    vi.advanceTimersByTime(2 * HOUR_MS);
    maybePruneTelemetry(Date.now());
    expect(bag.deleteMany).toHaveBeenCalledTimes(2);
  });

  it("a failing prune is swallowed and does not wedge the throttle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000 * HOUR_MS);
    bag.deleteMany.mockRejectedValueOnce(new Error("db down"));

    maybePruneTelemetry(Date.now());
    expect(bag.deleteMany).toHaveBeenCalledTimes(1);
    await flush();

    // Next window retries despite the earlier failure.
    vi.advanceTimersByTime(2 * HOUR_MS);
    maybePruneTelemetry(Date.now());
    expect(bag.deleteMany).toHaveBeenCalledTimes(2);
  });

  it("concurrent ticks do not stack prunes while one is in flight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(9_000 * HOUR_MS);
    let resolveDelete: (v: { count: number }) => void = () => {};
    bag.deleteMany.mockReturnValueOnce(
      new Promise((res) => { resolveDelete = res; })
    );

    maybePruneTelemetry(Date.now());
    maybePruneTelemetry(Date.now());
    maybePruneTelemetry(Date.now());
    resolveDelete({ count: 0 });

    expect(bag.deleteMany).toHaveBeenCalledTimes(1);
  });
});
