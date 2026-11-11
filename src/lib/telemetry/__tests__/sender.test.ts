import { describe, it, expect, vi, beforeEach } from "vitest";

// The sender: nothing without consent, one day sent once, failures swallowed.

const bag = vi.hoisted(() => ({
  state: { enabled: false, installId: null as string | null, lastSentDay: null as string | null },
  inserts: [] as any[],
  insertError: null as { code?: string; message: string } | null,
}));

vi.mock("@/lib/appSettings", () => ({
  getAppSetting: async () => bag.state,
  setAppSetting: async (_key: string, value: unknown) => {
    bag.state = value as typeof bag.state;
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: async (row: any) => {
        bag.inserts.push({ table, row });
        return { error: bag.insertError };
      },
    }),
  }),
}));

// The snapshot's derivations are tested in usage.test.ts; here it is stubbed
// so the sender's own logic stands alone (and no real Prisma client loads).
vi.mock("@/lib/telemetry/usage", () => ({
  computeUsageSnapshot: async () => ({
    day: "2026-11-10", appVersion: "0.5.24", platform: process.platform, servers: 1, games: ["MINECRAFT"],
    deployed: true, first_online: true, mods: true, invite: true, friend_joined: true,
    status_share: false, session_planned: false, remote_host: false, active: true,
  }),
  utcDay: (d: Date) => d.toISOString().slice(0, 10),
  explainSnapshot: () => [],
}));

import { maybeSendUsageSnapshot } from "../sender";
import { getUsageTelemetryState, setUsageConsent } from "../consent";

const T0 = new Date("2026-11-10T19:00:00Z");

beforeEach(() => {
  bag.state = { enabled: false, installId: null, lastSentDay: null };
  bag.inserts = [];
  bag.insertError = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:3999";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

describe("maybeSendUsageSnapshot", () => {
  it("sends nothing at all while consent is off", async () => {
    expect(await maybeSendUsageSnapshot(T0)).toBe("off");
    expect(bag.inserts).toHaveLength(0);
  });

  it("reports unconfigured rather than sending nowhere", async () => {
    await setUsageConsent(true);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(await maybeSendUsageSnapshot(T0)).toBe("unconfigured");
    expect(bag.inserts).toHaveLength(0);
  });

  it("sends the day's snapshot under the install id, then once per day", async () => {
    const state = await setUsageConsent(true);
    expect(state.installId).toMatch(/[0-9a-f-]{36}/);

    expect(await maybeSendUsageSnapshot(T0)).toBe("sent");
    expect(bag.inserts).toHaveLength(1);
    expect(bag.inserts[0]).toMatchObject({ table: "usage_snapshots", row: { install_id: state.installId, day: "2026-11-10", platform: process.platform } });
    expect((await getUsageTelemetryState()).lastSentDay).toBe("2026-11-10");

    expect(await maybeSendUsageSnapshot(T0)).toBe("already-sent");
    expect(await maybeSendUsageSnapshot(new Date("2026-11-10T23:59:00Z"))).toBe("already-sent");
    expect(bag.inserts).toHaveLength(1);
  });

  it("a fresh UTC day sends again", async () => {
    await setUsageConsent(true);
    await maybeSendUsageSnapshot(new Date("2026-11-10T12:00:00Z"));
    expect(await maybeSendUsageSnapshot(new Date("2026-11-11T12:00:00Z"))).toBe("sent");
    expect(bag.inserts).toHaveLength(2);
  });

  it("a primary-key rejection counts as already sent", async () => {
    await setUsageConsent(true);
    bag.insertError = { code: "23505", message: 'duplicate key value violates unique constraint "usage_snapshots_pkey"' };
    expect(await maybeSendUsageSnapshot(T0)).toBe("already-sent");
    expect((await getUsageTelemetryState()).lastSentDay).toBe("2026-11-10");
  });

  it("any other cloud failure is swallowed and retried later", async () => {
    await setUsageConsent(true);
    bag.insertError = { message: "fetch failed" };
    expect(await maybeSendUsageSnapshot(T0)).toBe("failed");
    expect((await getUsageTelemetryState()).lastSentDay).toBeNull();
  });

  it("opting out clears the install id, so opting back in starts anonymous and fresh", async () => {
    const on = await setUsageConsent(true);
    const off = await setUsageConsent(false);
    expect(off).toEqual({ enabled: false, installId: null, lastSentDay: null });
    const again = await setUsageConsent(true);
    expect(again.installId).toMatch(/[0-9a-f-]{36}/);
    expect(again.installId).not.toBe(on.installId);
  });
});
