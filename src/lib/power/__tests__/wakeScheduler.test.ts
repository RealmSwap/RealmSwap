import { describe, it, expect, vi, beforeEach } from "vitest";

// Reconciling the registered Windows wake task with the plan. The task
// commands and the plan are injected; only the persisted "what is registered"
// state goes through the (mocked) settings store.

const store = vi.hoisted(() => ({ values: new Map<string, unknown>() }));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/appSettings", () => ({
  getAppSetting: async (key: string, fallback: unknown) => (store.values.has(key) ? store.values.get(key) : fallback),
  setAppSetting: async (key: string, value: unknown) => {
    store.values.set(key, value);
  },
}));

import { syncWakeTask, clearWakeTaskOnQuit } from "../wakeScheduler";
import { WAKE_LEAD_MS, type ScheduledStart } from "../wakePlan";

const now = new Date("2026-11-10T12:00:00");
const startAt = (hoursAhead: number, label = "Friday Night"): ScheduledStart => {
  const dueAt = new Date(now.getTime() + hoursAhead * 60 * 60_000);
  return { dueAt, holdUntil: new Date(dueAt.getTime() + 30 * 60_000), serverId: "s1", serverName: "Srv", source: "automation", label };
};
const wakeIso = (start: ScheduledStart) => new Date(start.dueAt.getTime() - WAKE_LEAD_MS).toISOString();

let registered: Date[];
let cleared: number;
const deps = (starts: ScheduledStart[], over: Record<string, unknown> = {}) => ({
  now,
  loadStarts: async () => starts,
  wakeEnabled: async () => true,
  register: async (at: Date) => {
    registered.push(at);
  },
  clear: async () => {
    cleared += 1;
  },
  ...over,
});

beforeEach(() => {
  store.values.clear();
  registered = [];
  cleared = 0;
});

describe("syncWakeTask", () => {
  it("registers a wake a few minutes ahead of the next scheduled start, once", async () => {
    const start = startAt(7);
    const first = await syncWakeTask(deps([start]));
    expect(first).toMatchObject({ registeredFor: wakeIso(start), error: null });
    expect(first.nextStart?.label).toBe("Friday Night");
    expect(registered.map((d) => d.toISOString())).toEqual([wakeIso(start)]);

    await syncWakeTask(deps([start])); // the minute loop, nothing changed
    expect(registered).toHaveLength(1);
    expect(cleared).toBe(0);
  });

  it("moves the wake when an earlier start appears", async () => {
    const later = startAt(7, "Later");
    const sooner = startAt(2, "Sooner");
    await syncWakeTask(deps([later]));
    const sync = await syncWakeTask(deps([later, sooner]));
    expect(sync.registeredFor).toBe(wakeIso(sooner));
    expect(registered.map((d) => d.toISOString())).toEqual([wakeIso(later), wakeIso(sooner)]);
    expect(cleared).toBe(0); // registering replaces the task; nothing to clear first
  });

  it("clears the wake when nothing is scheduled any more", async () => {
    await syncWakeTask(deps([startAt(7)]));
    const sync = await syncWakeTask(deps([]));
    expect(sync).toMatchObject({ registeredFor: null, nextStart: null });
    expect(cleared).toBe(1);

    await syncWakeTask(deps([])); // already clear
    expect(cleared).toBe(1);
  });

  it("clears it when the owner turns waking off, and registers nothing while it's off", async () => {
    await syncWakeTask(deps([startAt(7)]));
    const off = await syncWakeTask(deps([startAt(7)], { wakeEnabled: async () => false }));
    expect(off.registeredFor).toBeNull();
    expect(cleared).toBe(1);
    expect(registered).toHaveLength(1);
  });

  it("treats a wake whose moment has passed as gone: it fired and deleted itself", async () => {
    store.values.set("power.wakeTask", { at: new Date(now.getTime() - 60_000).toISOString() });
    await syncWakeTask(deps([]));
    expect(cleared).toBe(0);

    const start = startAt(5);
    const sync = await syncWakeTask(deps([start]));
    expect(sync.registeredFor).toBe(wakeIso(start));
  });

  it("does not wake for a start that is already upon us", async () => {
    const imminent = startAt(0.02); // ~72 seconds out; its wake moment is in the past
    const sync = await syncWakeTask(deps([imminent]));
    expect(sync.registeredFor).toBeNull();
    expect(registered).toHaveLength(0);
  });

  it("reports a failure without pretending the task is registered", async () => {
    const sync = await syncWakeTask(
      deps([startAt(7)], {
        register: async () => {
          throw new Error("schtasks /Create failed: Access is denied.");
        },
      })
    );
    expect(sync.error).toMatch(/Access is denied/);
    expect(sync.registeredFor).toBeNull();
    expect(store.values.get("power.wakeTask")).toBeUndefined();
  });
});

describe("clearWakeTaskOnQuit", () => {
  it("removes the task and forgets it, so a quit RealmSwap wakes nobody", async () => {
    await syncWakeTask(deps([startAt(7)]));
    await clearWakeTaskOnQuit({
      clear: async () => {
        cleared += 1;
      },
    });
    expect(cleared).toBe(1);
    expect(store.values.get("power.wakeTask")).toEqual({ at: null });
  });

  it("never throws into the quit path", async () => {
    await expect(
      clearWakeTaskOnQuit({
        clear: async () => {
          throw new Error("boom");
        },
      })
    ).resolves.toBeUndefined();
  });
});
