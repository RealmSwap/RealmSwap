import { prisma } from "@/lib/db";

/**
 * The moments RealmSwap already knows a server on this machine is going to be
 * started for people: a planned game night (the Discord bot starts the server
 * `autoStartLeadMinutes` ahead of it) or a scheduled automation with a Start
 * Server action. The power features exist so the PC is awake for those
 * moments and stays awake long enough for people to show up.
 */
export interface ScheduledStart {
  /** When the start fires. */
  dueAt: Date;
  /** Hold the PC awake until here so people can arrive before "nobody's online" counts. */
  holdUntil: Date;
  serverId: string;
  serverName: string;
  source: "session" | "automation";
  /** Session title or automation name. */
  label: string;
  /** "AGENT" starts live on a node: the dashboard still wakes itself (the Windows
   *  task runs the WoL + start), but holding THIS PC awake for arrivals and the
   *  running-server rules are the node's business. */
  runnerType: string;
  /** The node's Wake-on-LAN target, when the start runs on an agent. */
  nodeMac: string | null;
  /** Set when runnerType is "AGENT": the node hosting this server. */
  nodeId?: string | null;
}

/** Wake this long before a start is due: resume from sleep, reconnect, let the scheduler tick. */
export const WAKE_LEAD_MS = 3 * 60_000;
/** How long after a start (or a game night's start time) people get to arrive. */
export const ARRIVAL_GRACE_MS = 30 * 60_000;
/** Wake timers are not registered further out than this; the plan is redone every minute anyway. */
export const WAKE_HORIZON_MS = 30 * 24 * 60 * 60_000;

export function wakeTimeFor(start: ScheduledStart): Date {
  return new Date(start.dueAt.getTime() - WAKE_LEAD_MS);
}

/** The next start still worth a wake timer: its wake moment is at least a minute away. */
export function nextStartToWakeFor(starts: ScheduledStart[], now: Date): ScheduledStart | null {
  const earliest = now.getTime() + 60_000;
  const latest = now.getTime() + WAKE_HORIZON_MS;
  return (
    starts
      .filter((s) => wakeTimeFor(s).getTime() >= earliest && s.dueAt.getTime() <= latest)
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] ?? null
  );
}

/** The start whose window we are inside right now: from its wake moment until people have had time to arrive. */
export function activeStartWindow(starts: ScheduledStart[], now: Date): ScheduledStart | null {
  const t = now.getTime();
  return (
    starts
      .filter((s) => wakeTimeFor(s).getTime() <= t && t <= s.holdUntil.getTime())
      .sort((a, b) => b.holdUntil.getTime() - a.holdUntil.getTime())[0] ?? null
  );
}

export async function loadScheduledStarts(now: Date = new Date()): Promise<ScheduledStart[]> {
  const since = new Date(now.getTime() - ARRIVAL_GRACE_MS);
  const until = new Date(now.getTime() + WAKE_HORIZON_MS);
  const starts: ScheduledStart[] = [];

  const sessions = await prisma.plannedSession.findMany({
    where: { startTime: { gt: since, lt: until } },
    include: { server: { select: { id: true, name: true, autoStartLeadMinutes: true, runnerType: true, nodeId: true } } },
  });
  for (const session of sessions) {
    const leadMs = (session.server.autoStartLeadMinutes ?? 15) * 60_000;
    starts.push({
      dueAt: new Date(session.startTime.getTime() - leadMs),
      holdUntil: new Date(session.startTime.getTime() + ARRIVAL_GRACE_MS),
      serverId: session.server.id,
      serverName: session.server.name,
      source: "session",
      label: session.title,
      runnerType: session.server.runnerType,
      nodeId: session.server.nodeId,
      nodeMac: null,
    });
  }

  const automations = await prisma.automation.findMany({
    where: {
      enabled: true,
      actions: { some: { type: "START_SERVER" } },
      OR: [{ nextRunAt: { gt: since, lt: until } }, { lastRunAt: { gt: since } }],
    },
    include: { server: { select: { id: true, name: true, runnerType: true, nodeId: true } } },
  });
  for (const automation of automations) {
    // An upcoming (or due-but-not-yet-fired) run, and separately the run that
    // just fired — once it fires, nextRunAt jumps to the following occurrence.
    const moments = [automation.nextRunAt, automation.lastRunAt].filter(
      (d): d is Date => !!d && d.getTime() > since.getTime() && d.getTime() < until.getTime()
    );
    for (const dueAt of moments) {
      starts.push({
        dueAt,
        holdUntil: new Date(dueAt.getTime() + ARRIVAL_GRACE_MS),
        serverId: automation.server.id,
        serverName: automation.server.name,
        source: "automation",
        label: automation.name,
        runnerType: automation.server.runnerType,
        nodeId: automation.server.nodeId,
        nodeMac: null,
      });
    }
  }

  // Attach the WoL targets for agent-hosted starts (nodeId is a plain column,
  // no relation) — one lookup for whichever nodes are actually involved.
  const nodeIds = Array.from(new Set(starts.filter((s) => s.nodeId).map((s) => s.nodeId!)));
  if (nodeIds.length > 0) {
    const nodes = await prisma.agentNode.findMany({
      where: { id: { in: nodeIds } },
      select: { id: true, macAddress: true },
    });
    const macById = new Map(nodes.map((n) => [n.id, n.macAddress]));
    for (const start of starts) {
      if (start.nodeId) start.nodeMac = macById.get(start.nodeId) ?? null;
    }
  }

  return starts;
}
