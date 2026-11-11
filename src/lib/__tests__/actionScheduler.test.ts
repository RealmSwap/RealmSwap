import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Guards for executeAutomation's post-run bookkeeping: the schedule must
 * advance from the stored trigger config (previously CRON-only and reading a
 * field the editor never wrote), and a fired ONE_TIME automation must switch
 * itself off. Boundaries (prisma, action registry, SFTP) are mocked.
 */

const bag = vi.hoisted(() => ({
  automation: null as any,
  automations: [] as any[],
  conditions: [] as any[],
  executionsCreated: [] as any[],
  executionUpdates: [] as any[],
  automationUpdates: [] as any[],
  // When set, the test action blocks on it — a run that outlasts the scheduler tick.
  actionGate: null as Promise<void> | null,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    get automation() {
      return {
        findUnique: async () => bag.automation,
        findMany: async () => bag.automations,
        update: async (args: any) => {
          bag.automationUpdates.push(args);
          return {};
        },
      };
    },
    get automationCondition() {
      return { findMany: async () => bag.conditions };
    },
    get automationExecution() {
      return {
        create: async (args: any) => {
          bag.executionsCreated.push(args);
          return { id: `exec-${bag.executionsCreated.length}` };
        },
        update: async (args: any) => {
          bag.executionUpdates.push(args);
          return {};
        },
      };
    },
  },
}));
vi.mock("@/lib/automations/registry", () => ({
  ActionRegistry: new Map([
    [
      "TEST_ACTION",
      {
        id: "TEST_ACTION",
        name: "Test",
        description: "",
        execute: async () => {
          if (bag.actionGate) await bag.actionGate;
        },
      },
    ],
  ]),
}));

import { executeAutomation, fireServerCrashAutomations, checkAutomations, MISSED_RUN_GRACE_MS } from "../actionScheduler";

function cronAutomation(overrides: Record<string, any> = {}) {
  return {
    id: "a1",
    name: "Nightly",
    triggerType: "CRON",
    triggerConfig: JSON.stringify({ cronExpression: "0 4 * * *" }),
    server: { id: "s1", name: "Srv", status: "RUNNING", cpuUsage: 0, memoryUsage: 0 },
    actions: [{ type: "TEST_ACTION", order: 0, config: null }],
    ...overrides,
  };
}

beforeEach(() => {
  bag.automation = null;
  bag.automations = [];
  bag.conditions = [];
  bag.executionsCreated = [];
  bag.executionUpdates = [];
  bag.automationUpdates = [];
  bag.actionGate = null;
});

describe("executeAutomation", () => {
  it("advances nextRunAt from the stored cronExpression after a run", async () => {
    bag.automation = cronAutomation();
    await executeAutomation("a1");

    expect(bag.executionsCreated).toHaveLength(1);
    expect(bag.executionsCreated[0].data.status).toBe("RUNNING");
    expect(bag.automationUpdates).toHaveLength(1);

    const data = bag.automationUpdates[0].data;
    expect(data.lastRunAt).toBeInstanceOf(Date);
    // The exact bug: this used to read config.expression (never written) via
    // a cron-parser v4 default import — leaving nextRunAt null forever.
    expect(data.nextRunAt).toBeInstanceOf(Date);
    expect(data.nextRunAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    expect(data).not.toHaveProperty("enabled");
  });

  it("switches a fired ONE_TIME automation off instead of leaving it armed", async () => {
    const runAt = new Date(Date.now() - 1000).toISOString(); // just fired
    bag.automation = cronAutomation({
      triggerType: "ONE_TIME",
      triggerConfig: JSON.stringify({ runAt }),
    });
    await executeAutomation("a1");

    const data = bag.automationUpdates[0].data;
    expect(data.nextRunAt).toBeNull();
    expect(data.enabled).toBe(false);
  });

  it("skips execution entirely when conditions are not met", async () => {
    bag.automation = cronAutomation();
    bag.conditions = [{ type: "SERVER_STATE", operator: "EQUALS", value: "STOPPED" }]; // server is RUNNING
    await executeAutomation("a1");

    expect(bag.executionsCreated).toHaveLength(0);
    expect(bag.automationUpdates).toHaveLength(0);
  });
});

describe("fireServerCrashAutomations", () => {
  it("executes every enabled SERVER_CRASH automation for the server", async () => {
    bag.automations = [
      { id: "a1", name: "Crash cleanup" },
      { id: "a2", name: "Crash announce" },
    ];
    bag.automation = cronAutomation({ id: "a1", triggerType: "SERVER_CRASH", triggerConfig: null });

    await fireServerCrashAutomations("s1");
    // fire-and-forget: let the microtasks settle
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(bag.executionsCreated.length).toBeGreaterThanOrEqual(1);
  });
});

// The scheduler tick. It runs on a PC that sleeps and gets closed, so it has
// to cope with runs that came due while nothing was here to run them, and
// with runs that outlast the tick interval.
describe("checkAutomations", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const now = new Date("2026-11-10T19:00:00");
  const dueAt = (msAgo: number, overrides: Record<string, any> = {}) => {
    const automation = cronAutomation({ nextRunAt: new Date(now.getTime() - msAgo), ...overrides });
    bag.automations = [automation];
    bag.automation = automation;
    return automation;
  };

  it("runs an automation that came due on time", async () => {
    dueAt(30_000);
    await checkAutomations(now);
    await settle();

    expect(bag.executionsCreated).toHaveLength(1);
    expect(bag.executionsCreated[0].data.status).toBe("RUNNING");
  });

  it("still runs one that is late but inside the grace window", async () => {
    dueAt(MISSED_RUN_GRACE_MS - 60_000);
    await checkAutomations(now);
    await settle();

    expect(bag.executionsCreated[0].data.status).toBe("RUNNING");
  });

  it("records a run that came due while the app was away as missed, and moves the schedule past now", async () => {
    dueAt(MISSED_RUN_GRACE_MS + 60_000);
    await checkAutomations(now);
    await settle();

    expect(bag.executionsCreated).toHaveLength(1);
    expect(bag.executionsCreated[0].data.status).toBe("SKIPPED");
    expect(bag.executionsCreated[0].data.logs).toMatch(/Missed the run/);
    expect(bag.executionUpdates).toHaveLength(0); // nothing actually ran

    const data = bag.automationUpdates[0].data;
    expect(data.nextRunAt.getTime()).toBeGreaterThan(now.getTime());
    expect(data).not.toHaveProperty("lastRunAt");
    expect(data).not.toHaveProperty("enabled");
  });

  it("switches off a ONE_TIME automation whose moment passed while the app was away", async () => {
    dueAt(MISSED_RUN_GRACE_MS + 60_000, {
      triggerType: "ONE_TIME",
      triggerConfig: JSON.stringify({ runAt: "2026-11-10T12:00" }),
    });
    await checkAutomations(now);
    await settle();

    expect(bag.executionsCreated[0].data.status).toBe("SKIPPED");
    expect(bag.automationUpdates[0].data).toMatchObject({ nextRunAt: null, enabled: false });
  });

  it("does not start a second copy of a run that is still going", async () => {
    let release!: () => void;
    bag.actionGate = new Promise<void>((resolve) => (release = resolve));
    const automation = cronAutomation({ nextRunAt: new Date(Date.now() - 1000) });
    bag.automations = [automation];
    bag.automation = automation;

    await checkAutomations();
    await settle();
    await checkAutomations(); // the next tick: nextRunAt has not advanced because the run is not finished
    await settle();
    expect(bag.executionsCreated).toHaveLength(1);

    release();
    await settle();
    bag.actionGate = null;
    await checkAutomations(); // finished, so it is eligible again
    await settle();
    expect(bag.executionsCreated).toHaveLength(2);
  });
});
