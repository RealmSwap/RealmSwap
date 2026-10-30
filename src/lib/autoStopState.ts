/**
 * Pure state for player sampling + auto-stop. No imports on purpose:
 * processMonitor reads it every tick, and depending on the full autoStop
 * engine here would close an import cycle through the runners.
 */

export interface PlayerSample {
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

export function stateFor(serverId: string): AutoStopState {
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
