import { prisma } from "@/lib/db";
import { getPowerSettings, type PowerSettings } from "./settings";
import { activeStartWindow, loadScheduledStarts, type ScheduledStart } from "./wakePlan";

/**
 * Whether this PC should be held awake right now, and why.
 *
 * Windows sleeps on user-input idleness; a game server full of friends is
 * "idle" by that measure, so without this the host PC goes to sleep under
 * them. The rule is to never sleep under players unless RealmSwap can prove
 * nobody is there: a running server keeps the PC awake while its latest
 * player sample is non-zero OR missing. A server known to be empty does not,
 * unless the owner asked for that — the power bill is theirs.
 *
 * Around a scheduled start the PC is also held awake outright: after a wake
 * timer fires with nobody at the keyboard, Windows goes back to sleep within
 * a couple of minutes unless something asks it not to.
 */
export interface KeepAwakeDecision {
  keepAwake: boolean;
  /** Human-readable, shown in Settings so the behavior is never a mystery. */
  reasons: string[];
}

export interface LocalServerState {
  name: string;
  status: string;
  /** Latest recent player count, or null when there is no fresh sample. */
  playersOnline: number | null;
}

/** Player samples land about every 5 minutes; older than this means "don't know". */
export const PLAYER_SAMPLE_FRESH_MS = 12 * 60_000;

export function decideKeepAwake(input: {
  settings: PowerSettings;
  servers: LocalServerState[];
  startWindow: ScheduledStart | null;
}): KeepAwakeDecision {
  const { settings, servers, startWindow } = input;
  if (!settings.keepAwake) return { keepAwake: false, reasons: [] };

  const reasons: string[] = [];
  if (startWindow) {
    const what = startWindow.source === "session" ? "Game night" : "Scheduled start";
    reasons.push(`${what} "${startWindow.label}" on ${startWindow.serverName}`);
  }
  for (const server of servers) {
    if (server.status === "STARTING") reasons.push(`${server.name} is starting`);
    else if (server.status === "UPDATING") reasons.push(`${server.name} is updating`);
    else if (server.status === "RUNNING") {
      if (server.playersOnline !== null && server.playersOnline > 0) {
        reasons.push(`${server.playersOnline} player${server.playersOnline === 1 ? "" : "s"} on ${server.name}`);
      } else if (server.playersOnline === null) {
        reasons.push(`${server.name} is running and RealmSwap can't tell whether anyone is on it`);
      } else if (settings.keepAwakeWhileRunning) {
        reasons.push(`${server.name} is running`);
      }
    }
  }
  return { keepAwake: reasons.length > 0, reasons };
}

export async function computeKeepAwake(now: Date = new Date()): Promise<KeepAwakeDecision> {
  const settings = await getPowerSettings();
  if (!settings.keepAwake) return { keepAwake: false, reasons: [] };

  const rows = await prisma.server.findMany({
    where: { runnerType: { not: "AGENT" }, status: { in: ["RUNNING", "STARTING", "UPDATING"] } },
    select: { id: true, name: true, status: true },
  });
  const freshSince = new Date(now.getTime() - PLAYER_SAMPLE_FRESH_MS);
  const servers: LocalServerState[] = await Promise.all(
    rows.map(async (row) => {
      if (row.status !== "RUNNING") return { name: row.name, status: row.status, playersOnline: null };
      const sample = await prisma.serverTelemetry.findFirst({
        where: { serverId: row.id, playerCount: { not: null }, createdAt: { gt: freshSince } },
        orderBy: { createdAt: "desc" },
        select: { playerCount: true },
      });
      return { name: row.name, status: row.status, playersOnline: sample?.playerCount ?? null };
    })
  );

  const startWindow = activeStartWindow(await loadScheduledStarts(now), now);
  return decideKeepAwake({ settings, servers, startWindow });
}
