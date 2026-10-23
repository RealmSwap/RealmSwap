import { CronExpressionParser } from "cron-parser";
import { TriggerConfig, TriggerType } from "./types";

/**
 * Pure schedule math shared by the API routes (validate + persist nextRunAt),
 * the scheduler (advance nextRunAt after a run), and the calendar view
 * (expand upcoming occurrences). No DB, no clock reading — every function
 * takes an explicit `from` so behavior is deterministic and testable.
 */

export const TRIGGER_TYPES = [
  "CRON",
  "ONE_TIME",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "SERVER_CRASH",
  "PLAYER_JOINED",
  "PLAYER_LEFT",
] as const;

/** Types whose next run can be computed from the calendar. */
export const SCHEDULED_TRIGGER_TYPES = ["CRON", "ONE_TIME", "DAILY", "WEEKLY", "MONTHLY"] as const;

/** Types fired by runtime events instead of the scheduler tick. */
export const EVENT_TRIGGER_TYPES = ["SERVER_CRASH", "PLAYER_JOINED", "PLAYER_LEFT"] as const;

export function isScheduledTriggerType(type: string): type is TriggerType {
  return (SCHEDULED_TRIGGER_TYPES as readonly string[]).includes(type);
}

function parseTimeOfDay(value: string | undefined): { hours: number; minutes: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? "");
  if (!match) throw new Error(`${value ?? "missing"} is not a valid timeOfDay (expected HH:MM, 24h)`);
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/**
 * Next occurrence of this trigger strictly after `from` (local time, matching
 * how the host runs the scheduler).
 *
 * Returns null for event triggers (SERVER_CRASH etc.) — they have no calendar.
 * Throws an Error with an actionable message when a scheduled type's config is
 * missing or invalid; callers turn that into a 400 or a skipped recompute.
 */
export function computeNextRunAt(
  type: TriggerType,
  config: TriggerConfig,
  from: Date = new Date()
): Date | null {
  switch (type) {
    case "CRON": {
      if (!config.cronExpression) throw new Error("cronExpression is required for CRON triggers");
      try {
        return CronExpressionParser.parse(config.cronExpression, { currentDate: from })
          .next()
          .toDate();
      } catch {
        throw new Error(`'${config.cronExpression}' is not a valid cron expression`);
      }
    }

    case "DAILY": {
      const { hours, minutes } = parseTimeOfDay(config.timeOfDay);
      const candidate = new Date(from);
      candidate.setHours(hours, minutes, 0, 0);
      if (candidate.getTime() <= from.getTime()) candidate.setDate(candidate.getDate() + 1);
      return candidate;
    }

    case "WEEKLY": {
      if (config.dayOfWeek === undefined || config.dayOfWeek === null) {
        throw new Error("dayOfWeek (0=Sunday … 6=Saturday) is required for WEEKLY triggers");
      }
      const { hours, minutes } = parseTimeOfDay(config.timeOfDay);
      const candidate = new Date(from);
      candidate.setDate(candidate.getDate() + ((config.dayOfWeek - from.getDay() + 7) % 7));
      candidate.setHours(hours, minutes, 0, 0);
      if (candidate.getTime() <= from.getTime()) candidate.setDate(candidate.getDate() + 7);
      return candidate;
    }

    case "MONTHLY": {
      const dayOfMonth: number | undefined = config.dayOfMonth;
      if (dayOfMonth === undefined || dayOfMonth === null) {
        throw new Error("dayOfMonth (1-31) is required for MONTHLY triggers");
      }
      const { hours, minutes } = parseTimeOfDay(config.timeOfDay);
      // JS Dates roll over on impossible days (Feb 30 → Mar 2), so verify the
      // day landed where asked; e.g. a 31st skips months that don't have one.
      for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
        // Annotated for tsc: the Date overload + narrowed union args otherwise
        // trip TS7022 circular inference inside the loop.
        const candidate: Date = new Date(
          from.getFullYear(),
          from.getMonth() + monthOffset,
          dayOfMonth,
          hours,
          minutes,
          0,
          0
        );
        if (candidate.getDate() === dayOfMonth && candidate.getTime() > from.getTime()) {
          return candidate;
        }
      }
      throw new Error(`Could not find a future date for dayOfMonth ${dayOfMonth}`);
    }

    case "ONE_TIME": {
      if (!config.runAt) throw new Error("runAt is required for ONE_TIME triggers");
      const runAt = new Date(config.runAt);
      if (Number.isNaN(runAt.getTime())) throw new Error(`'${config.runAt}' is not a valid runAt date`);
      if (runAt.getTime() <= from.getTime()) {
        throw new Error("ONE_TIME runAt must be in the future");
      }
      return runAt;
    }

    default:
      return null;
  }
}

/**
 * All occurrences of this trigger inside (from, from + days], for the calendar
 * view. Event triggers and invalid configs produce an empty list — the UI
 * never guesses at a schedule the engine wouldn't honor.
 */
export function expandOccurrences(
  type: TriggerType,
  config: TriggerConfig,
  from: Date = new Date(),
  days: number = 7
): Date[] {
  if (!isScheduledTriggerType(type)) return [];
  const until = from.getTime() + days * 24 * 60 * 60 * 1000;
  const occurrences: Date[] = [];
  let cursor = from;
  // Step just past each occurrence to find the next one; a throwing config
  // (e.g. ONE_TIME whose runAt just passed) simply ends the expansion.
  for (let guard = 0; guard < 500; guard++) {
    let next: Date | null;
    try {
      next = computeNextRunAt(type, config, cursor);
    } catch {
      break;
    }
    if (!next || next.getTime() >= until) break;
    occurrences.push(next);
    cursor = new Date(next.getTime() + 1000);
  }
  return occurrences;
}
