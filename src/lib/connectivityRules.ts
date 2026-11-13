import type { ConnectivityCheck, ConnectivityReport } from "./connectivityCheck";

/**
 * The connectivity monitor's decisions, kept pure: what a connectivity
 * report means for "can friends outside this network reach the server", and
 * when a change in that is worth telling the owner about.
 */

/** How often a running server's public path is re-checked. */
export const CONNECTIVITY_CHECK_INTERVAL_MS = 2 * 60_000;
/** Consecutive bad checks before the owner is told — rides out a tunnel reconnect or a slow router. */
export const LOST_AFTER_BAD_CHECKS = 2;

export type ConnectivityVerdict = "ok" | "bad" | "not-applicable" | "unknown";

export interface PublicPathConfig {
  tunnelEnabled: boolean;
  enableUpnp: boolean;
  tunnelUrl: string | null;
}

export function classifyReport(
  report: ConnectivityReport,
  server: PublicPathConfig,
): { verdict: ConnectivityVerdict; problem: ConnectivityCheck | null } {
  const check = (id: string) => report.checks.find((c) => c.id === id);
  if (check("server")?.status !== "ok") return { verdict: "unknown", problem: null };

  // The owner chose LAN-only (or switched the public path off): nothing to lose.
  if (!server.tunnelEnabled && !server.enableUpnp) return { verdict: "not-applicable", problem: null };

  const listen = check("listen");
  const router = check("router");
  if (listen?.status === "fail") return { verdict: "bad", problem: listen };
  if (router?.status === "fail") return { verdict: "bad", problem: router };
  // The one router warning that is a real outage: an address is advertised
  // but the tunnel behind it is not running.
  if (router?.status === "warn" && server.tunnelUrl) return { verdict: "bad", problem: router };
  if (router?.status === "ok") return { verdict: "ok", problem: null };
  return { verdict: "unknown", problem: null };
}

export interface ConnectivityMemory {
  everReachable: boolean;
  badStreak: number;
  alerted: boolean;
}

export type ConnectivityEvent = "lost" | "restored" | null;

/**
 * Advance the per-server memory by one check. A loss is only an event after
 * the path was seen working in this run — a server that never had a public
 * path is a setup question Join Info already answers, not an incident — and
 * only once it has persisted.
 */
export function nextConnectivityState(
  memory: ConnectivityMemory,
  verdict: ConnectivityVerdict,
): { memory: ConnectivityMemory; event: ConnectivityEvent } {
  if (verdict === "unknown") return { memory, event: null };
  if (verdict === "not-applicable") {
    return { memory: { everReachable: false, badStreak: 0, alerted: false }, event: null };
  }
  if (verdict === "ok") {
    return {
      memory: { everReachable: true, badStreak: 0, alerted: false },
      event: memory.alerted ? "restored" : null,
    };
  }
  if (!memory.everReachable) return { memory, event: null };
  const badStreak = memory.badStreak + 1;
  const tell = badStreak >= LOST_AFTER_BAD_CHECKS && !memory.alerted;
  return {
    memory: { everReachable: true, badStreak, alerted: memory.alerted || tell },
    event: tell ? "lost" : null,
  };
}
