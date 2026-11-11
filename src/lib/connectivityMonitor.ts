import { prisma } from "./db";
import { serverEventBus } from "./eventBus";
import { parseSpec } from "./definitions/serialize";
import { runConnectivityChecks, type ConnectivityCheck, type ConnectivityDeps } from "./connectivityCheck";
import { isTunnelAlive } from "./tunnels";
import { sendNotification } from "./notifications";
import { connectivityStateFor, resetConnectivityState } from "./connectivityState";
import { classifyReport, nextConnectivityState, CONNECTIVITY_CHECK_INTERVAL_MS } from "./connectivityRules";

/**
 * Tells the owner when friends can no longer reach a running server, before
 * the friends do. The Join Info troubleshooter answers "why can't they
 * join?" when someone asks; this asks on a timer.
 *
 * It re-runs the same checks every couple of minutes for each running server
 * on this machine and watches for the public path (playit tunnel or UPnP
 * mapping) going from working to broken: a tunnel playit stopped forwarding,
 * a router that rebooted and dropped the mapping, a game that stopped
 * listening. The rules — what counts, when it's worth an alert — are pure
 * and live in connectivityRules.ts.
 */

export const CONNECTIVITY_LOST_ACTION = "CONNECTIVITY_LOST";
export const CONNECTIVITY_RESTORED_ACTION = "CONNECTIVITY_RESTORED";

const globalForMonitor = globalThis as unknown as {
  __connectivityMonitorAttached: boolean | undefined;
};

/** Subscribe to the process monitor's tick. Called once at boot from instrumentation.ts. */
export function attachConnectivityMonitor(): void {
  if (globalForMonitor.__connectivityMonitorAttached) return;
  globalForMonitor.__connectivityMonitorAttached = true;
  serverEventBus.on("monitor_tick", ({ serverId }: { serverId: string }) => {
    maybeCheckConnectivity(serverId).catch((e) =>
      console.error(`[Connectivity Monitor] Server ${serverId}:`, e?.message)
    );
  });
}

type MonitoredServer = {
  id: string; userId: string; name: string; status: string; port: number;
  runnerType: string | null; definitionId: string | null; game: string;
  enableUpnp: boolean; upnpMapped: boolean | null;
  tunnelEnabled: boolean; tunnelUrl: string | null;
};

async function resolveSpec(server: { definitionId: string | null; game: string }) {
  const record = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  return record ? parseSpec(record.spec) : null;
}

/** What to tell the owner, in terms of what they can do about it. */
export function describeLoss(server: MonitoredServer, problem: ConnectivityCheck | null): string {
  if (problem?.id === "listen") {
    return `'${server.name}' is running, but nothing is listening on port ${server.port} any more. Check its console.`;
  }
  if (server.tunnelEnabled && server.tunnelUrl) {
    return `The playit tunnel for '${server.name}' has stopped — its agent is no longer running. Open Join Info and switch the tunnel off and on.`;
  }
  if (server.tunnelEnabled) {
    return `playit is no longer forwarding the tunnel for '${server.name}' — it may have been disabled or removed on playit's side. Open Join Info to bring it back.`;
  }
  if (server.enableUpnp) {
    return `Your router has stopped forwarding the port for '${server.name}' — it may have rebooted or dropped the mapping. Restart the server to map it again, or switch on the playit tunnel in Join Info.`;
  }
  return problem?.detail ?? `'${server.name}' is no longer reachable from outside your network.`;
}

/**
 * One guarded check for a server; a no-op unless its interval has elapsed.
 * Never throws into the monitor tick.
 */
export async function maybeCheckConnectivity(
  serverId: string,
  opts: { now?: number; checkDeps?: ConnectivityDeps } = {},
): Promise<void> {
  const now = opts.now ?? Date.now();
  let state = connectivityStateFor(serverId);

  // Ticks only arrive while a server runs. A long silence means it was
  // stopped in between: this is a new run, and it starts from scratch.
  if (state.lastCheckAt && now - state.lastCheckAt > 3 * CONNECTIVITY_CHECK_INTERVAL_MS && !state.inFlight) {
    resetConnectivityState(serverId);
    state = connectivityStateFor(serverId);
  }
  if (state.inFlight || now - state.lastCheckAt < CONNECTIVITY_CHECK_INTERVAL_MS) return;
  state.inFlight = true;
  state.lastCheckAt = now;

  try {
    const server = (await prisma.server.findUnique({ where: { id: serverId } })) as MonitoredServer | null;
    if (!server || server.status !== "RUNNING") {
      resetConnectivityState(serverId);
      return;
    }
    // A node's network is the node's; its heartbeat already covers tunnel liveness.
    if (server.runnerType === "AGENT") return;

    const spec = await resolveSpec(server);
    if (!spec) return;

    const report = await runConnectivityChecks(server, spec, {
      tunnelAlive: isTunnelAlive,
      // The troubleshooter looks the public IP up to show it; a background
      // check has no one to show it to and no business pinging a third party.
      publicIP: async () => null,
      ...opts.checkDeps,
    });

    const { verdict, problem } = classifyReport(report, server);
    const { memory, event } = nextConnectivityState(state, verdict);
    Object.assign(state, memory);

    if (event === "lost") {
      const message = describeLoss(server, problem);
      await sendNotification(server.userId, `📡 Friends can't reach ${server.name}`, message, {
        serverId: server.id,
        kind: "connectivity",
      });
      await prisma.activityLog
        .create({ data: { userId: server.userId, serverId: server.id, action: CONNECTIVITY_LOST_ACTION, details: message } })
        .catch(() => {});
    } else if (event === "restored") {
      const message = `'${server.name}' is reachable from outside your network again.`;
      await sendNotification(server.userId, `✅ ${server.name} is reachable again`, message, {
        serverId: server.id,
        kind: "connectivity",
      });
      await prisma.activityLog
        .create({ data: { userId: server.userId, serverId: server.id, action: CONNECTIVITY_RESTORED_ACTION, details: message } })
        .catch(() => {});
    }
  } finally {
    state.inFlight = false;
  }
}
