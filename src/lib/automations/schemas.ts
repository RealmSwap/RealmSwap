import { z } from "zod";
import { TRIGGER_TYPES } from "./schedule";

/** Shared API validation for create/update of automations. */

export const triggerConfigSchema = z.strictObject({
  cronExpression: z.string().min(1).optional(), // CRON
  runAt: z.string().min(1).optional(), // ONE_TIME — datetime-local string
  dayOfWeek: z.number().int().min(0).max(6).optional(), // WEEKLY
  dayOfMonth: z.number().int().min(1).max(31).optional(), // MONTHLY
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeOfDay must be HH:MM (24h)").optional(), // DAILY/WEEKLY/MONTHLY
});

export const automationActionSchema = z.object({
  type: z.string().min(1),
  config: z.any().optional(),
});

export const automationConditionSchema = z.object({
  type: z.string().min(1),
  operator: z.string().min(1),
  value: z.string(),
});

export const automationCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  enabled: z.boolean().default(true),
  triggerType: z.enum(TRIGGER_TYPES),
  triggerConfig: triggerConfigSchema.optional(),
  actions: z.array(automationActionSchema).min(1, "At least one action is required"),
  conditions: z.array(automationConditionSchema).optional(),
});

export const automationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  triggerType: z.enum(TRIGGER_TYPES).optional(),
  triggerConfig: triggerConfigSchema.optional(),
  actions: z.array(automationActionSchema).min(1).optional(),
  conditions: z.array(automationConditionSchema).optional(),
});
