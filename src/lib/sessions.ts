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
export function formatSessionStart(iso: string): string {
  const when = new Date(iso);
  const now = new Date();
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
