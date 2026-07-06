import { Server, Automation, AutomationCondition, AutomationAction, AutomationExecution } from "@/generated/client";

export interface AutomationContext {
  server: Server;
  automation: Automation;
  execution: AutomationExecution;
  log: (msg: string) => Promise<void>;
  state: Record<string, any>; // Used to pass data between actions if needed
}

export interface AutomationActionInterface {
  id: string;
  name: string;
  description: string;
  execute(context: AutomationContext, config: any): Promise<void>;
}

export type TriggerType = "CRON" | "ONE_TIME" | "DAILY" | "WEEKLY" | "MONTHLY" | "SERVER_CRASH" | "PLAYER_JOINED" | "PLAYER_LEFT";

export type ConditionOperator = "EQUALS" | "NOT_EQUALS" | "LESS_THAN" | "GREATER_THAN" | "CONTAINS";

export interface TriggerConfig {
  cronExpression?: string; // For CRON type
  runAt?: string;          // ISO date string for ONE_TIME
  dayOfWeek?: number;      // 0-6 for WEEKLY
  dayOfMonth?: number;     // 1-31 for MONTHLY
  timeOfDay?: string;      // HH:mm for DAILY, WEEKLY, MONTHLY
}

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color?: string;
  defaultConfig: any;
}
