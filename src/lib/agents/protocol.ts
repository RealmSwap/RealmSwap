/**
 * Wire protocol between the dashboard and RealmSwap agents.
 *
 * One channel, agent-initiated: the agent POSTs /api/agents/sync on a short
 * loop (long-poll) carrying capabilities, per-server reports, and command
 * results; the response carries pending commands. The dashboard owns ALL
 * game knowledge — commands ship fully-resolved launch plans — so the agent
 * is a dumb executor with no database and no game specs.
 *
 * Types only here: the agent bundle imports this file with `import type`,
 * keeping it dependency-free.
 */

export const AGENT_PROTOCOL_VERSION = 1;

/** How long the dashboard holds a sync request open waiting for work. */
export const SYNC_LONGPOLL_MS = 20000;
/** Agent heartbeats / command pickup cadence when work is pending. */
export const AGENT_SYNC_INTERVAL_MS = 5000;
/** A node is online while its last sync is younger than this. */
export const NODE_ONLINE_WINDOW_MS = 45000;

export interface StartCommandPayload {
  kind: "START";
  /** Server files root on the agent (its own data dir for this server). */
  dataDirName: string;
  /** Rendered config files, relative to the server data dir. */
  configFiles: { relPath: string; content: string }[];
  containerName: string;
  image: string;
  ports: { port: number; protocol: string }[];
  env: Record<string, string> | null;
  entrypoint: string;
  /** Self-declare RUNNING after this long without a readiness match (ms). Mirrors DockerRunner's 5-minute fallback. */
  readyFallbackMs: number | null;
}

export interface StopCommandPayload {
  kind: "STOP";
  containerName: string;
  stdinStopCommand: string | null;
}

export interface UpdateCommandPayload {
  kind: "UPDATE";
  containerImage: string;
  dataDirName: string;
  steamcmdCmd: string;
}

export interface SendCommandPayload {
  kind: "SEND_COMMAND";
  containerName: string;
  command: string;
}

export type CommandPayload =
  | StartCommandPayload
  | StopCommandPayload
  | UpdateCommandPayload
  | SendCommandPayload;

/** What the agent reports per server it manages. */
export interface ServerReport {
  serverId: string;
  status: "RUNNING" | "STARTING" | "STOPPED";
  exitCode?: number | null;
  wasIntentional?: boolean;
  cpuPercent?: number;
  memoryMB?: number;
  logLines?: string[];
  /** True on the report right after a container start (agent saw docker run succeed). */
  started?: boolean;
}

export interface SyncRequest {
  protocolVersion: number;
  agentVersion: string;
  platform: string;
  arch: string;
  dockerVersion: string | null;
  lanIp: string | null;
  totalRamMB: number | null;
  freeDiskGB: number | null;
  servers: ServerReport[];
  results: { commandId: string; ok: boolean; error?: string; output?: string }[];
}

export interface SyncCommand {
  id: string;
  type: "START" | "STOP" | "UPDATE" | "SEND_COMMAND";
  serverId: string;
  payload: CommandPayload;
}

export interface SyncResponse {
  commands: SyncCommand[];
  /** AGENT servers assigned to this node — lets the agent re-attach to
   *  containers that are still running after an agent restart. */
  assignedServers: { serverId: string }[];
}

/** Registration handshake: one-time enrollment token -> node credentials. */
export interface RegisterResponse {
  nodeId: string;
  nodeSecret: string;
  nodeName: string;
  protocolVersion: number;
}
