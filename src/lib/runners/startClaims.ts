/**
 * Single-flight claims for server lifecycle operations (start / restart /
 * update). The DB status alone can't arbitrate — it's written after the fact
 * and can be stale — so the start route, restart chain, and update paths all
 * claim the server in memory first. Without this, two quick Start clicks each
 * passed the old `localProcesses.has()` check (which is tested once, before a
 * multi-minute install) and spawned two game processes fighting over the same
 * world files and port.
 */

const globalForClaims = globalThis as unknown as {
  serverStartClaims: Set<string> | undefined;
};
if (!globalForClaims.serverStartClaims) {
  globalForClaims.serverStartClaims = new Set();
}
const claims = globalForClaims.serverStartClaims;

/** Atomically claim the server for one lifecycle operation. */
export function claimStart(serverId: string): boolean {
  if (claims.has(serverId)) return false;
  claims.add(serverId);
  return true;
}

export function releaseStart(serverId: string): void {
  claims.delete(serverId);
}

export function isStartClaimed(serverId: string): boolean {
  return claims.has(serverId);
}
