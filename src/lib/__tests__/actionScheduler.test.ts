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
vi.mock("@/lib/sftpServer", () => ({ startSFTPServer: vi.fn() }));
vi.mock("@/lib/automations/registry", () => ({
  ActionRegistry: new Map([
    ["TEST_ACTION", { id: "TEST_ACTION", name: "Test", description: "", execute: async () => {} }],
  ]),
}));

import { executeAutomation, fireServerCrashAutomations } from "../actionScheduler";

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
