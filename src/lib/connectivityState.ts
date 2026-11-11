/**
 * Per-server memory for the connectivity monitor. No imports on purpose:
 * tunnels.ts marks a server as "already alerted" when it reports a tunnel
 * crash itself, and the monitor imports tunnels — sharing this file instead
 * of each other keeps that from being an import cycle.
 */

export interface ConnectivityState {
  lastCheckAt: number;
  inFlight: boolean;
  /** A public path worked at some point in this run; losses only count after that. */
  everReachable: boolean;
  /** Consecutive checks that found the public path broken. */
  badStreak: number;
  /** The owner has been told it is down and not yet told it is back. */
  alerted: boolean;
}

const globalForConnectivity = globalThis as unknown as {
  __connectivityState: Map<string, ConnectivityState> | undefined;
};

function stateMap(): Map<string, ConnectivityState> {
  if (!globalForConnectivity.__connectivityState) globalForConnectivity.__connectivityState = new Map();
  return globalForConnectivity.__connectivityState;
}

export function connectivityStateFor(serverId: string): ConnectivityState {
  const map = stateMap();
  let state = map.get(serverId);
  if (!state) {
    state = { lastCheckAt: 0, inFlight: false, everReachable: false, badStreak: 0, alerted: false };
    map.set(serverId, state);
  }
  return state;
}

export function resetConnectivityState(serverId: string): void {
  stateMap().delete(serverId);
}

/**
 * Something else already told the owner this server's public path is down
 * (the tunnel crash handler does, the moment the daemon dies). The monitor
 * must not say it a second time — but should still say when it's back.
 */
export function noteConnectivityAlerted(serverId: string): void {
  const state = connectivityStateFor(serverId);
  state.everReachable = true;
  state.alerted = true;
}
