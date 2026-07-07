import { prisma } from "./db";
import parser from "cron-parser";
import { ActionRegistry } from "./automations/registry";
import { AutomationContext, TriggerConfig } from "./automations/types";
import { Automation, AutomationExecution } from "@/generated/client";
import { startSFTPServer } from "./sftpServer";

const globalForScheduler = globalThis as unknown as {
  actionSchedulerInterval: NodeJS.Timeout | undefined;
};

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

  // Update last run time and calculate next run time
  let newNextRunAt: Date | null = null;
  if (automation.triggerType === "CRON" && automation.triggerConfig) {
    try {
      const config = JSON.parse(automation.triggerConfig);
      if (config.expression) {
        const interval = parser.parse(config.expression);
        newNextRunAt = interval.next().toDate();
      }
    } catch(e) {}
  }

  await prisma.automation.update({
    where: { id: automation.id },
    data: { 
      lastRunAt: new Date(),
      nextRunAt: newNextRunAt 
    }
  });
}

// Check and execute scheduled automations
async function checkAutomations() {
  try {
    const now = new Date();
    
    const automations = await prisma.automation.findMany({
      where: { 
        enabled: true,
        nextRunAt: { lte: now } 
      },
    });

    for (const automation of automations) {
      executeAutomation(automation.id).catch(e => console.error("Execution error", e));
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
  
  // Start SFTP Server
  startSFTPServer();

  // Run check immediately on start, then every 60s
  checkAutomations().catch(err => console.error("Initial automation check failed:", err));
  
  globalForScheduler.actionSchedulerInterval = setInterval(() => {
    checkAutomations().catch(err => console.error("Periodic automation check failed:", err));
  }, 60000);
}
