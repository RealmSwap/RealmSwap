import { prisma } from "./db";
import { CronExpressionParser } from "cron-parser";
import { ActionRegistry } from "./automations/registry";
import { AutomationContext, TriggerConfig } from "./automations/types";
import { Automation, AutomationExecution } from "@/generated/client";

const globalForScheduler = globalThis as unknown as {
  actionSchedulerInterval: NodeJS.Timeout | undefined;
};

// Evaluate conditions
async function evaluateConditions(automationId: string): Promise<boolean> {
  const conditions = await prisma.automationCondition.findMany({ where: { automationId } });
  if (conditions.length === 0) return true;

  // In a real implementation we would fetch server state (CPU, RAM, players) and evaluate.
  // For now, we mock condition evaluation to true.
  for (const cond of conditions) {
    console.log(`[Automation Engine] Evaluating condition: ${cond.type} ${cond.operator} ${cond.value}`);
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
  const conditionsMet = await evaluateConditions(automation.id);
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

  // Update last run time
  await prisma.automation.update({
    where: { id: automation.id },
    data: { lastRunAt: new Date() }
  });
}

// Check and execute scheduled automations
async function checkAutomations() {
  try {
    const now = new Date();
    
    const automations = await prisma.automation.findMany({
      where: { enabled: true },
    });

    for (const automation of automations) {
      let shouldRun = false;

      // Handle CRON trigger
      if (automation.triggerType === "CRON" && automation.triggerConfig) {
        try {
          const config = JSON.parse(automation.triggerConfig) as TriggerConfig;
          if (config.cronExpression) {
            const interval = CronExpressionParser.parse(config.cronExpression);
            const prevDate = interval.prev().toDate(); // the last time it SHOULD have run

            if (!automation.lastRunAt) {
              if (prevDate.getTime() > new Date(automation.createdAt).getTime()) {
                shouldRun = true;
              }
            } else if (automation.lastRunAt.getTime() < prevDate.getTime()) {
              shouldRun = true;
            }
          }
        } catch (e) {
          console.error(`Invalid config for automation ${automation.id}`);
        }
      } else if (automation.triggerType === "DAILY" && automation.triggerConfig) {
         try {
           const config = JSON.parse(automation.triggerConfig) as TriggerConfig;
           if (config.timeOfDay) {
             const [hours, minutes] = config.timeOfDay.split(":").map(Number);
             const runTimeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
             
             if (!automation.lastRunAt) {
               if (now.getTime() >= runTimeToday.getTime() && new Date(automation.createdAt).getTime() < runTimeToday.getTime()) {
                 shouldRun = true;
               }
             } else if (now.getTime() >= runTimeToday.getTime() && automation.lastRunAt.getTime() < runTimeToday.getTime()) {
               shouldRun = true;
             }
           }
         } catch(e) {}
      }
      // Add other trigger types here (WEEKLY, MONTHLY, SERVER_CRASH, etc.)

      if (shouldRun) {
        executeAutomation(automation.id).catch(e => console.error("Execution error", e));
      }
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
