import net from "net";
import { getPublicIP } from "./upnp";
import { listBoundSockets, type BoundSocket } from "./boundPorts";
import type { GameDefinitionSpec } from "./definitions/types";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface ConnectivityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fixCommand?: string; // copyable one-liner that resolves the issue
}

export interface ConnectivityReport {
  overall: "ready" | "maybe" | "blocked";
  checks: ConnectivityCheck[];
}

export interface ConnectivityDeps {
  /** What the OS reports bound locally (TCP listeners + UDP sockets); null = this host can't tell. */
  boundSockets?: () => Promise<BoundSocket[] | null>;
  connect?: (port: number) => Promise<boolean>; // fallback: can we open a local TCP connection?
  publicIP?: () => Promise<string | null>;
  platform?: NodeJS.Platform;
  tunnelAlive?: (serverId: string) => boolean; // live playit agent for this server
}

/** Real local TCP probe — resolves true when something listens on 127.0.0.1:port. */
function defaultConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port, timeout: 1500 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

/** The TCP connect only means something when the join port itself is TCP.
 *  A spec may declare TCP for another port (Rust's RCON) or for nothing the
 *  game serves (Enshrouded) — neither makes the game port probeable.
 *  Templated port specs can't be resolved here and count as "might be". */
function tcpProbeApplies(spec: GameDefinitionSpec, port: number): boolean {
  return (spec.ports ?? []).some((p) => {
    if (p.protocol !== "TCP") return false;
    const n = Number(p.port);
    return !Number.isFinite(n) || n === port;
  });
}

/**
 * Diagnose "friends can't connect" for a server. Checks, in order: the server
 * is running, the game is actually listening locally, the router path (UPnP
 * mapping / playit tunnel), and — on Windows — a copyable firewall fix with
 * the game's real executable. Read-only; never mutates router or OS state.
 */
export async function runConnectivityChecks(
  server: {
    id: string; name: string; status: string; port: number;
    enableUpnp: boolean; tunnelUrl: string | null;
    runnerType?: string | null;
  },
  spec: GameDefinitionSpec,
  deps: ConnectivityDeps = {}
): Promise<ConnectivityReport> {
  const boundSockets = deps.boundSockets ?? listBoundSockets;
  const connect = deps.connect ?? defaultConnect;
  const publicIP = deps.publicIP ?? getPublicIP;
  const platform = deps.platform ?? process.platform;
  // Live liveness is injected (the tunnels module owns the agent map); the
  // DB flag alone is not proof the tunnel still forwards.
  const tunnelAlive = deps.tunnelAlive ?? (() => false);
  const checks: ConnectivityCheck[] = [];

  // 1. Server running
  const running = server.status === "RUNNING";
  checks.push({
    id: "server",
    label: "Server status",
    status: running ? "ok" : "fail",
    detail: running
      ? "Server is running."
      : `Server is ${server.status}. Friends can only join while it's running.`,
  });

  // 2. Game listening locally. Ask the OS what is bound to the port, TCP or
  //    UDP — a TCP connect can't see UDP games (Enshrouded, Valheim, Rust…),
  //    which used to read as "nothing is listening" with players inside.
  if (!running) {
    checks.push({
      id: "listen",
      label: "Game is listening",
      status: "skip",
      detail: "Skipped while the server is stopped.",
    });
  } else if (server.runnerType === "AGENT") {
    checks.push({
      id: "listen",
      label: "Game is listening",
      status: "skip",
      detail: "The game runs on a node — this machine can't see its sockets; the node's heartbeat reports the server state.",
    });
  } else {
    const sockets = await boundSockets().catch(() => null);
    if (sockets) {
      const bound = sockets.filter((s) => s.port === server.port);
      const protocols = Array.from(new Set(bound.map((s) => s.protocol))).sort();
      checks.push({
        id: "listen",
        label: "Game is listening",
        status: bound.length ? "ok" : "fail",
        detail: bound.length
          ? `Port ${server.port} is open locally (${protocols.join(" + ")}).`
          : `Nothing on this machine is bound to port ${server.port} (TCP or UDP) — the game may still be starting, or it's configured for a different port than RealmSwap expects.`,
      });
    } else if (tcpProbeApplies(spec, server.port)) {
      const listening = await connect(server.port);
      checks.push({
        id: "listen",
        label: "Game is listening",
        status: listening ? "ok" : "fail",
        detail: listening
          ? `Port ${server.port} answers locally.`
          : `Nothing is listening on port ${server.port} yet — the game may still be starting up.`,
      });
    } else {
      checks.push({
        id: "listen",
        label: "Game is listening",
        status: "skip",
        detail: "UDP-based game — this host offers no way to verify the local listener.",
      });
    }
  }

  // 3. Router path: tunnel wins (works regardless of router), else UPnP
  if (server.tunnelUrl) {
    const alive = tunnelAlive(server.id);
    checks.push({
      id: "router",
      label: "Router / outside access",
      status: alive ? "ok" : "warn",
      detail: alive
        ? `Playit tunnel active (${server.tunnelUrl}) — friends can join even with no port forwarding.`
        : `A tunnel address is saved (${server.tunnelUrl}) but no playit agent is running. Toggle the tunnel off and on in Join Info — until then this address is unreachable.`,
    });
  } else if (server.enableUpnp) {
    const ip = await publicIP().catch(() => null);
    if (ip) {
      checks.push({
        id: "router",
        label: "Router / outside access",
        status: "ok",
        detail: `Router answers UPnP and the port mapping was requested at start. Public IP: ${ip}.`,
      });
    } else {
      checks.push({
        id: "router",
        label: "Router / outside access",
        status: "fail",
        detail: "UPnP is enabled but the router is not responding. Many routers disable UPnP by default.",
        fixCommand: "Enable UPnP in your router's admin page, or turn on the Playit tunnel in General Settings (no router access needed).",
      });
    }
  } else {
    checks.push({
      id: "router",
      label: "Router / outside access",
      status: "fail",
      detail: "Neither a tunnel nor UPnP is active — the port is not reachable from the internet.",
      fixCommand: "Turn on 'Playit.gg Tunneling' in Server Config → General Settings. It works without touching your router.",
    });
  }

  // 4. Windows Firewall — cannot be verified programmatically here, so hand the
  //    user the exact rule for the game's real executable instead of guessing.
  if (platform === "win32") {
    const exe = spec.launch.executable;
    checks.push({
      id: "firewall",
      label: "Windows Firewall",
      status: "warn",
      detail: `Can't verify the firewall automatically. If friends still can't join, allow the game through it (run this in an admin PowerShell):`,
      fixCommand: `netsh advfirewall firewall add rule name="RealmSwap ${spec.launch.executable}" dir=in action=allow program="${exe}" enable=yes`,
    });
  } else {
    checks.push({
      id: "firewall",
      label: "Windows Firewall",
      status: "skip",
      detail: "Only applies on Windows hosts.",
    });
  }

  // The firewall check is advisory (can't be verified programmatically), so it
  // must not downgrade an otherwise healthy server to "maybe".
  const overall: ConnectivityReport["overall"] = checks.some((c) => c.status === "fail")
    ? "blocked"
    : checks.some((c) => c.id !== "firewall" && c.status === "warn")
      ? "maybe"
      : "ready";
  return { overall, checks };
}
