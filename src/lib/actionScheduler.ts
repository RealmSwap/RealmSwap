import { prisma } from "./db";
import { ActionRegistry } from "./automations/registry";
import { AutomationContext, TriggerConfig, TriggerType } from "./automations/types";
import { computeNextRunAt } from "./automations/schedule";
import { Automation, AutomationExecution } from "@/generated/client";

const globalForScheduler = globalThis as unknown as {
  actionSchedulerInterval: NodeJS.Timeout | undefined;
  automationsInFlight: Set<string> | undefined;
};

/**
 * How late a scheduled run may still fire. RealmSwap lives on a PC that
 * sleeps and gets closed, so "due" rows pile up while it's away — and
 * replaying a 4 a.m. restart at 7 p.m., in the middle of game night, is worse
 * than skipping it. A run later than this is recorded as missed and the
 * schedule moves on to its next occurrence.
 */
export const MISSED_RUN_GRACE_MS = 15 * 60 * 1000;

// Evaluate conditions
async function evaluateConditions(automationId: string, server: any): Promise<boolean> {
  const conditions = await prisma.automationCondition.findMany({ where: { automationId } });
  if (conditions.length === 0) return true;

  for (const cond of conditions) {
    let actualValue: any = null;
    let expectedValue: any = cond.value;

    if (cond.type === "SERVER_STATE") {
      actualValue = server.status;
    } else if (cond.type === "CPU_USAGE") {
      actualValue = server.cpuUsage;
      expectedValue = parseFloat(cond.value);
    } else if (cond.type === "RAM_USAGE") {
      actualValue = server.memoryUsage;
      expectedValue = parseFloat(cond.value);
    } else if (cond.type === "PLAYERS_ONLINE") {
      // Mock players online for now as it requires heavy GameDig query, or assume 0 if offline
      actualValue = server.status === "RUNNING" ? 1 : 0;
      expectedValue = parseInt(cond.value, 10);
    }

    let isMet = false;
    switch (cond.operator) {
      case "EQUALS":
        isMet = actualValue == expectedValue;
        break;
      case "NOT_EQUALS":
        isMet = actualValue != expectedValue;
        break;
      case "GREATER_THAN":
        isMet = actualValue > expectedValue;
        break;
      case "LESS_THAN":
        isMet = actualValue < expectedValue;
        break;
      case "CONTAINS":
        isMet = String(actualValue).includes(String(expectedValue));
        break;
      default:
        isMet = false;
    }

    if (!isMet) {
      console.log(`[Automation Engine] Condition NOT met: ${cond.type} (${actualValue}) ${cond.operator} ${expectedValue}`);
      return false; // All conditions must be met (AND logic)
    }
  }
  
  return true; 
}

// Executes a single automation
export async function executeAutomation(automationId: string) {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
    include: { server: true, actions: { orderBy: { order: 'asc' } } }
  });

  if (!automation || !automation.server) return;

  // Check conditions
  const conditionsMet = await evaluateConditions(automation.id, automation.server);
  if (!conditionsMet) {
    console.log(`[Automation Engine] Conditions not met for ${automation.name}, skipping.`);
    return;
  }

  // Create execution record
  const execution = await prisma.automationExecution.create({
    data: {
      automationId: automation.id,
      status: "RUNNING",
    }
  });

  const logs: string[] = [];
  const log = async (msg: string) => {
    const timestamp = new Date().toISOString();
    logs.push(`[${timestamp}] ${msg}`);
    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: { logs: JSON.stringify(logs) }
    });
    console.log(`[Automation ${automation.name}] ${msg}`);
  };

  const context: AutomationContext = {
    server: automation.server,
    automation,
    execution,
    log,
    state: {}
  };

  await log(`Starting automation execution for ${automation.name} on ${context.server.name}`);

  try {
    for (const actionRow of automation.actions) {
      const actionHandler = ActionRegistry.get(actionRow.type);
      if (!actionHandler) {
        await log(`Unknown action type: ${actionRow.type}. Failing execution.`);
        throw new Error(`Unknown action type: ${actionRow.type}`);
      }

      await log(`Running action: ${actionHandler.name}`);
      let config = {};
      try {
        if (actionRow.config) config = JSON.parse(actionRow.config);
      } catch (e) {}
      
      await actionHandler.execute(context, config);
    }

    await log("Automation completed successfully.");
    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: { status: "SUCCESS", finishedAt: new Date() }
    });
  } catch (error: any) {
    await log(`Automation failed: ${error.message}`);
    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: { status: "FAILED", finishedAt: new Date() }
    });
  }

  // Update last run time and advance the schedule. Event triggers keep a null
  // nextRunAt (nothing on the calendar); a fired ONE_TIME automation switches
  // itself off so it can't silently sit "ready" forever.
  let newNextRunAt: Date | null = null;
  try {
    const config = automation.triggerConfig ? JSON.parse(automation.triggerConfig) : {};
    newNextRunAt = computeNextRunAt(automation.triggerType as TriggerType, config);
  } catch (e) {}

  await prisma.automation.update({
    where: { id: automation.id },
    data: {
      lastRunAt: new Date(),
      nextRunAt: newNextRunAt,
      ...(automation.triggerType === "ONE_TIME" ? { enabled: false } : {}),
    }
  });
}

/**
 * Fired from the runner when a server is finally declared CRASHED (auto-
 * restart retries exhausted, or the auto-restart itself failed). Conditions
 * are still evaluated per execution, exactly like scheduled runs.
 */
export async function fireServerCrashAutomations(serverId: string) {
  const automations = await prisma.automation.findMany({
    where: { serverId, enabled: true, triggerType: "SERVER_CRASH" },
  });
  for (const automation of automations) {
    console.log(`[Automation Engine] Firing crash-triggered automation '${automation.name}'`);
    executeAutomation(automation.id).catch(e =>
      console.error(`[Automation Engine] Crash-triggered execution failed for ${automation.name}:`, e)
    );
  }
}

/** Record a run that came due while nothing was here to run it, and move the schedule on. */
async function skipMissedRun(automation: Automation, now: Date) {
  let nextRunAt: Date | null = null;
  try {
    const config = automation.triggerConfig ? JSON.parse(automation.triggerConfig) : {};
    nextRunAt = computeNextRunAt(automation.triggerType as TriggerType, config, now);
  } catch (e) {}

  const missed = automation.nextRunAt?.toISOString() ?? "an earlier time";
  console.log(`[Automation Engine] '${automation.name}' missed its run at ${missed}; skipping to ${nextRunAt?.toISOString() ?? "no further runs"}.`);
  await prisma.automationExecution.create({
    data: {
      automationId: automation.id,
      status: "SKIPPED",
      finishedAt: now,
      logs: JSON.stringify([
        `[${now.toISOString()}] Missed the run scheduled for ${missed}: RealmSwap wasn't running, or this PC was asleep. Skipped instead of running late.`,
      ]),
    },
  });
  await prisma.automation.update({
    where: { id: automation.id },
    data: {
      nextRunAt,
      ...(automation.triggerType === "ONE_TIME" ? { enabled: false } : {}),
    },
  });
}

// Check and execute scheduled automations
export async function checkAutomations(now: Date = new Date()) {
  try {
    const automations = await prisma.automation.findMany({
      where: { 
        enabled: true,
        nextRunAt: { lte: now } 
      },
    });

    // nextRunAt only advances once a run finishes, so without this a run that
    // outlasts the 60s tick would be started again on every tick until it did.
    const inFlight = (globalForScheduler.automationsInFlight ??= new Set<string>());

    for (const automation of automations) {
      if (inFlight.has(automation.id)) continue;

      if (automation.nextRunAt && now.getTime() - automation.nextRunAt.getTime() > MISSED_RUN_GRACE_MS) {
        await skipMissedRun(automation, now).catch(e => console.error("Missed-run bookkeeping error", e));
        continue;
      }

      inFlight.add(automation.id);
      executeAutomation(automation.id)
        .catch(e => console.error("Execution error", e))
        .finally(() => inFlight.delete(automation.id));
    }
  } catch (err: any) {
    console.error("[Automation Engine Error] Failed checking schedules:", err.message);
  }
}

// Initializer
export function initActionScheduler() {
  if (globalForScheduler.actionSchedulerInterval) {
    return; // Already active
  }

  console.log("[Automation Engine] Initialized background scheduled tasks loop (60s check).");

  // Run check immediately on start, then every 60s
  checkAutomations().catch(err => console.error("Initial automation check failed:", err));
  
  globalForScheduler.actionSchedulerInterval = setInterval(() => {
    checkAutomations().catch(err => console.error("Periodic automation check failed:", err));
  }, 60000);
}
