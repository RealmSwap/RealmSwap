import { getAppSetting, setAppSetting } from "@/lib/appSettings";
import { prisma } from "@/lib/db";
import { appendLog } from "@/lib/serverLogs";
import { NODE_ONLINE_WINDOW_MS } from "@/lib/agents/protocol";
import { wakeNode } from "@/lib/wol";
import { clearWakeTask, registerWakeTask, type TaskExec } from "./wakeTimer";
import { getPowerSettings } from "./settings";
import { loadScheduledStarts, nextStartToWakeFor, wakeTimeFor, type ScheduledStart } from "./wakePlan";

/**
 * Keeps the Windows wake task in line with the plan: registered for the next
 * scheduled start, replaced when plans change, cleared when nothing is
 * coming. Runs on a minute loop inside the desktop app only — the packaged
 * Windows app. From `npm run dev` or on Linux there is no host PC whose sleep
 * RealmSwap manages, and touching someone's Task Scheduler from a dev session
 * would be a surprise.
 */
export function wakeSupported(): boolean {
  return process.platform === "win32" && !!process.versions.electron;
}

export interface WakeSync {
  /** ISO instant the wake task is registered for, or null when none is. */
  registeredFor: string | null;
  /** The start that instant serves. */
  nextStart: ScheduledStart | null;
  error: string | null;
}

const STATE_KEY = "power.wakeTask";

const globalForWake = globalThis as unknown as {
  wakeSchedulerInterval?: NodeJS.Timeout;
  wakeSchedulerInFlight?: boolean;
  /** Agent starts already woken, keyed serverId:dueAt — one packet per moment. */
  wokenAgentStarts?: Set<string>;
};

/**
 * The default WoL action for an agent-hosted scheduled start: skip an awake
 * node, broadcast to a sleeping one's MAC. The start itself (actionScheduler
 * → RemoteRunner) re-wakes as a fallback, so a lost packet is not fatal.
 */
async function defaultWakeNode(start: ScheduledStart): Promise<boolean> {
  if (!start.nodeMac || !start.nodeId) return false;
  const node = await prisma.agentNode.findUnique({
    where: { id: start.nodeId },
    select: { macAddress: true, lastSeenAt: true },
  });
  if (!node?.macAddress) return false;
  if (node.lastSeenAt && Date.now() - node.lastSeenAt.getTime() < NODE_ONLINE_WINDOW_MS) return false;
  await wakeNode(node.macAddress);
  appendLog(start.serverId, `[Wake] Node asleep ahead of "${start.label}" — Wake-on-LAN sent to ${node.macAddress}.`);
  return true;
}

export interface WakeDeps {
  now?: Date;
  loadStarts?: (now: Date) => Promise<ScheduledStart[]>;
  wakeEnabled?: () => Promise<boolean>;
  register?: (at: Date) => Promise<void>;
  clear?: () => Promise<void>;
  exec?: TaskExec;
  /** Fires the Wake-on-LAN packet for an agent-hosted start in its wake window; returns whether a packet was sent. */
  wakeNodeFn?: (start: ScheduledStart) => Promise<boolean>;
}

/**
 * The task launches RealmSwap itself with --wake: if the app is running that
 * is a no-op nudge (see electron/main.js), and if it isn't — it was closed
 * before the PC slept — the scheduled start still has something to run it.
 */
function defaultRegister(exec?: TaskExec) {
  return (at: Date) => registerWakeTask(at, { command: process.execPath, args: "--wake" }, exec);
}

/** One reconciliation pass between the plan and the registered task. */
export async function syncWakeTask(deps: WakeDeps = {}): Promise<WakeSync> {
  const now = deps.now ?? new Date();
  const result: WakeSync = { registeredFor: null, nextStart: null, error: null };

  try {
    const stored = await getAppSetting<{ at: string | null }>(STATE_KEY, { at: null });
    // A registered instant that has passed is gone: the task fired and deleted itself.
    const registered = stored.at && new Date(stored.at).getTime() > now.getTime() ? stored.at : null;
    result.registeredFor = registered;

    const enabled = deps.wakeEnabled ? await deps.wakeEnabled() : (await getPowerSettings()).wakeForSchedule;
    const starts = deps.loadStarts ? await deps.loadStarts(now) : await loadScheduledStarts(now);
    const next = enabled ? nextStartToWakeFor(starts, now) : null;
    const wanted = next ? wakeTimeFor(next).toISOString() : null;
    result.nextStart = next;

    // Agent-hosted starts don't get a Windows wake task for the node's sake —
    // they get a magic packet at their wake moment (the Windows task above
    // still fires so THIS machine is awake to send it and run the start).
    if (enabled) {
      globalForWake.wokenAgentStarts ??= new Set<string>();
      const t = now.getTime();
      for (const start of starts) {
        if (start.runnerType !== "AGENT" || !start.nodeMac) continue;
        if (t < wakeTimeFor(start).getTime() || t > start.dueAt.getTime()) continue;
        const key = `${start.serverId}:${start.dueAt.toISOString()}`;
        if (globalForWake.wokenAgentStarts.has(key)) continue;
        globalForWake.wokenAgentStarts.add(key);
        const fired = await (deps.wakeNodeFn ?? defaultWakeNode)(start).catch((err) => {
          console.error("[Wake] WoL for a scheduled start failed:", err);
          return false;
        });
        if (!fired) globalForWake.wokenAgentStarts.delete(key);
      }
    }

    if (wanted === registered) return result;

    if (wanted) {
      // /Create /F replaces a task of the same name, so there is nothing to clear first.
      await (deps.register ?? defaultRegister(deps.exec))(new Date(wanted));
    } else {
      await (deps.clear ?? (() => clearWakeTask(deps.exec)))();
    }
    await setAppSetting(STATE_KEY, { at: wanted });
    result.registeredFor = wanted;
  } catch (err: any) {
    result.error = err?.message ?? String(err);
  }
  return result;
}

/** Best-effort removal when the app quits, so a RealmSwap that was closed on purpose wakes nobody. */
export async function clearWakeTaskOnQuit(deps: Pick<WakeDeps, "clear" | "exec"> = {}): Promise<void> {
  if (!wakeSupported() && !deps.clear) return;
  try {
    await (deps.clear ?? (() => clearWakeTask(deps.exec)))();
    await setAppSetting(STATE_KEY, { at: null });
  } catch {
    // quitting anyway
  }
}

export function startWakeScheduler(intervalMs = 60_000): void {
  if (!wakeSupported() || globalForWake.wakeSchedulerInterval) return;

  const tick = () => {
    if (globalForWake.wakeSchedulerInFlight) return;
    globalForWake.wakeSchedulerInFlight = true;
    syncWakeTask()
      .then((sync) => {
        if (sync.error) console.error("[Wake] could not update the wake timer:", sync.error);
      })
      .finally(() => {
        globalForWake.wakeSchedulerInFlight = false;
      });
  };
  tick();
  globalForWake.wakeSchedulerInterval = setInterval(tick, intervalMs);
}
