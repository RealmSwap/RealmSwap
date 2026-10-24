import { prisma } from "./db";
import { getRunner } from "./runners";
import { serverEventBus } from "./eventBus";
import { queryGameServer, GameQueryResult } from "./serverQuery";
import { parseSpec } from "./definitions/serialize";
import { sendNotification } from "./notifications";
import { evaluateAutoStop, AutoStopKind, PLAYER_SAMPLE_INTERVAL_MS } from "./autoStopRules";

/**
 * Player-count sampling + the auto-stop engine that consumes it.
 *
 * The process monitor ticks every 10s but a gamedig query is a network
 * round-trip against the game server, so player samples run in the
 * background at most every ~5 minutes (same shape as the disk walk: the
 * tick never blocks on it). When a sample completes it is parked as
 * "pending"; the next telemetry tick attaches it to the row it writes.
 *
 * The stop rules themselves are pure (autoStopRules.ts) and fail-open:
 * a query that doesn't answer never counts as "empty", and the empty
 * streak lives in memory so an app restart resets it.
 */

export { evaluateAutoStop, PLAYER_SAMPLE_INTERVAL_MS } from "./autoStopRules";

const PLAYER_QUERY_TIMEOUT_MS = 8_000;

export const IDLE_AUTO_STOP_ACTION = "IDLE_AUTO_STOP";
export const SESSION_AUTO_STOP_ACTION = "SESSION_AUTO_STOP";

interface PlayerSample {
  playerCount: number;
  maxPlayers: number | null;
}

interface AutoStopState {
  lastSampleAt: number;
  inFlight: boolean;
  stopping: boolean;
  emptyStreak: number;
  pending: PlayerSample | null; // completed sample not yet attached to a telemetry row
}

const globalForAutoStop = globalThis as unknown as {
  __autoStopState: Map<string, AutoStopState> | undefined;
};

function stateMap(): Map<string, AutoStopState> {
  if (!globalForAutoStop.__autoStopState) globalForAutoStop.__autoStopState = new Map();
  return globalForAutoStop.__autoStopState;
}

function stateFor(serverId: string): AutoStopState {
  const map = stateMap();
  let state = map.get(serverId);
  if (!state) {
    state = { lastSampleAt: 0, inFlight: false, stopping: false, emptyStreak: 0, pending: null };
    map.set(serverId, state);
  }
  return state;
}

/** A fresh run starts with a clean slate — the streak must span one continuous uptime. */
export function resetAutoStopState(serverId: string): void {
  stateMap().delete(serverId);
}

/** The sample completed since the last tick, if any — consumed by the telemetry stamp. */
export function takePendingPlayerSample(serverId: string): PlayerSample | null {
  const state = stateMap().get(serverId);
  if (!state?.pending) return null;
  const sample = state.pending;
  state.pending = null;
  return sample;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

async function resolveSpec(server: { definitionId: string | null; game: string }) {
  const record = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  return record ? parseSpec(record.spec) : null;
}

/**
 * Background player sample, due at most every PLAYER_SAMPLE_INTERVAL_MS.
 * Fire-and-forget from the monitor tick: on completion the sample is parked
 * for the next telemetry row and the auto-stop rules are evaluated against
 * the server's CURRENT settings (re-read from the DB so setting changes
 * apply without a restart).
 */
export async function maybeSamplePlayers(server: { id: string }): Promise<void> {
  const state = stateFor(server.id);
  const now = Date.now();
  if (state.inFlight || now - state.lastSampleAt < PLAYER_SAMPLE_INTERVAL_MS) return;
  state.inFlight = true;
  state.lastSampleAt = now;

  try {
    const fresh = await prisma.server.findUnique({ where: { id: server.id } });
    if (!fresh || fresh.status !== "RUNNING") return;

    const spec = await resolveSpec(fresh);
    let result: GameQueryResult | null = null;
    if (spec) {
      result = await withTimeout(
        queryGameServer(fresh, spec),
        PLAYER_QUERY_TIMEOUT_MS,
        { status: "offline", error: "Player query timed out" }
      );
    }

    if (result?.status === "online") {
      state.pending = { playerCount: result.players, maxPlayers: result.maxplayers ?? null };
    }

    // Session context for the session-auto-stop rule: the most recent
    // planned session whose start has already passed.
    const latestSession = await prisma.plannedSession.findFirst({
      where: { serverId: fresh.id, startTime: { lte: new Date() } },
      orderBy: { startTime: "desc" },
      select: { startTime: true },
    });

    const verdict = evaluateAutoStop({
      online: result?.status === "online",
      players: result?.status === "online" ? result.players : 0,
      idleStopEnabled: fresh.idleStopEnabled,
      idleStopMinutes: fresh.idleStopMinutes,
      sessionAutoStopHours: fresh.sessionAutoStopHours,
      latestSessionStartTime: latestSession?.startTime ?? null,
      emptyStreakBefore: state.emptyStreak,
      now: new Date(),
    });
    state.emptyStreak = verdict.emptyStreakAfter;

    if (verdict.stop && !state.stopping) {
      state.stopping = true;
      try {
        await autoStopServer(fresh, verdict.kind!, {
          idleMinutes: fresh.idleStopEnabled ? fresh.idleStopMinutes : undefined,
          sessionHours: fresh.sessionAutoStopHours > 0 ? fresh.sessionAutoStopHours : undefined,
        });
      } finally {
        state.stopping = false;
        state.emptyStreak = 0;
      }
    }
  } finally {
    state.inFlight = false;
  }
}

/**
 * Stop an empty server outside the dashboard: same flow as the Discord
 * bot's stop action — runner stop, STOPPED status + event, tunnel down,
 * attributable audit row, owner notification.
 */
export async function autoStopServer(
  server: { id: string; userId: string; name: string; runnerType: string },
  kind: AutoStopKind,
  context: { idleMinutes?: number; sessionHours?: number } = {}
): Promise<void> {
  const idle = kind === "idle";
  try {
    const runner = getRunner(server.runnerType);
    await runner.stop(server as any);
    await prisma.server.update({ where: { id: server.id }, data: { status: "STOPPED" } });
    serverEventBus.emit("status_update", { serverId: server.id, status: "STOPPED" });

    const { stopTunnel } = await import("./tunnels");
    await stopTunnel(server.id).catch(() => {});

    const action = idle ? IDLE_AUTO_STOP_ACTION : SESSION_AUTO_STOP_ACTION;
    const details = idle
      ? `Auto-stopped '${server.name}': the server had no players for ${context.idleMinutes ?? "the configured"} minutes.`
      : `Auto-stopped '${server.name}': nobody joined within ${context.sessionHours ?? "the configured"} hours of the planned session start.`;
    await prisma.activityLog.create({
      data: { userId: server.userId, serverId: server.id, action, details, metadata: JSON.stringify({ kind }) },
    }).catch(() => {});

    await sendNotification(
      server.userId,
      idle ? "🛑 Server stopped — idle" : "🛑 Server stopped — session ended",
      idle
        ? `Your server '${server.name}' had no players for ${context.idleMinutes ?? "a while"}, so it was stopped automatically to save resources. Start it again any time.`
        : `Nobody joined '${server.name}' within ${context.sessionHours ?? "the hours"} after the planned session start, so it was stopped automatically. Start it again any time.`,
      { serverId: server.id }
    );
  } catch (err: any) {
    console.error(`[AutoStop] Failed to stop server ${server.id}:`, err?.message);
    throw err;
  }
}
