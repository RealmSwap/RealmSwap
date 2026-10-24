// Client-safe helpers for displaying PlannedSession rows — the Discord bot
// writes them via /plan (title, start time, "I'm In" roster); the dashboard
// surfaces them. Kept free of prisma imports so both API routes and
// components can use it.

export interface PlannedSessionSummary {
  id: string;
  title: string;
  startTime: string; // ISO
  rosterCount: number;
}

// Raw roster is a JSON string of Discord user IDs — it never rides to the
// client; collaborators only get the count.
export function summarizePlannedSession(ps: {
  id: string;
  title: string;
  startTime: Date | string;
  roster: string;
}): PlannedSessionSummary {
  let rosterCount = 0;
  try {
    const parsed = JSON.parse(ps.roster);
    if (Array.isArray(parsed)) rosterCount = parsed.length;
  } catch {
    // Corrupt roster from an older bot version — show honestly as 0 in.
  }
  return {
    id: ps.id,
    title: ps.title,
    startTime: new Date(ps.startTime).toISOString(),
    rosterCount,
  };
}

// "Today 6:00 PM" / "Tomorrow 6:00 PM" / "Fri, Oct 24 6:00 PM"
// `now` is injectable so tests (and callers) can be deterministic — a test
// that computed "now + 2h" off the real clock failed on CI when it ran
// within 2 hours of local midnight and the answer flipped to "Tomorrow".
export function formatSessionStart(iso: string, now: Date = new Date()): string {
  const when = new Date(iso);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(when);
  if (when.toDateString() === now.toDateString()) return `Today ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (when.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(when);
}

/**
 * Should the event watcher auto-boot this session's server right now?
 * Pure so the per-server lead time (Server.autoStartLeadMinutes) is testable
 * without discord.js. Due once the session is within the lead window and
 * hasn't started yet — a lead of 0 means "at the start time".
 */
export function isAutoStartDue(sessionStartTime: Date | string, leadMinutes: number, now: Date): boolean {
  const start = new Date(sessionStartTime).getTime();
  const leadMs = Math.max(0, leadMinutes) * 60 * 1000;
  const t = now.getTime();
  return t >= start - leadMs && t < start;
}
