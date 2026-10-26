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
  /** Rendered config files, relative to the server data dir. `merge: true`
   *  merges the rendered content into an existing file (raw-editor edits
   *  survive restarts) instead of overwriting it. */
  configFiles: { relPath: string; content: string; merge?: boolean }[];
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

/** Zip-on-the-dashboard, tar-on-the-node: the agent tars its save dir with
 *  system tar and uploads it; the dashboard extracts and runs the normal
 *  backup machinery (verify, retention, offsite). */
export interface BackupCreateCommandPayload {
  kind: "BACKUP_CREATE";
  dataDirName: string;
  /** Save dir relative to the server data dir (same layout DOCKER uses). */
  srcRelDir: string;
  /** Valheim-only: archive just these files from srcRelDir (whatever exists). */
  includeFiles?: string[];
  /** Where to POST the tar (HMAC-authenticated). */
  uploadPath: string;
}

/** Restore = dashboard extracts the Backup zip, tars it, agent pulls it via a
 *  one-shot token, extracts to staging, and swaps into place. */
export interface BackupRestoreCommandPayload {
  kind: "BACKUP_RESTORE";
  dataDirName: string;
  /** Destination dir relative to the server data dir (same layout DOCKER uses). */
  destRelDir: string;
  /** One-shot download path (HMAC-authenticated). */
  downloadPath: string;
  /** swap = replace dest dir; overlay = add/overwrite files, keep the rest
   *  (Valheim worlds live alongside other worlds in the same dir). */
  mode: "swap" | "overlay";
}

/** Small-file read for the config editor. Result output JSON:
 *  `{ exists: boolean; content: string | null }` (content null when missing). */
export interface FileReadCommandPayload {
  kind: "FILE_READ";
  dataDirName: string;
  /** File relative to the server data dir. */
  relPath: string;
}

/** Small-file write for the config editor. `backup` keeps a last-known-good
 *  copy at `<relPath>.rsbak` before overwriting (raw-editor parity). Result
 *  output JSON: `{ written: number }` (bytes). */
export interface FileWriteCommandPayload {
  kind: "FILE_WRITE";
  dataDirName: string;
  relPath: string;
  content: string;
  backup?: boolean;
}

/** Directory listing for mod-config discovery (which .cfg/.toml exists).
 *  Result output JSON: `{ entries: { name: string; isDir: boolean }[] }` —
 *  empty when the directory doesn't exist yet. */
export interface FileListCommandPayload {
  kind: "FILE_LIST";
  dataDirName: string;
  /** Directory relative to the server data dir; "" = the data dir root. */
  relPath: string;
}

/** Apply a set of rendered config files in ONE round trip (settings saves):
 *  same merge semantics as START configFiles. Result output JSON:
 *  `{ written: number }` (files). */
export interface ConfigApplyCommandPayload {
  kind: "CONFIG_APPLY";
  dataDirName: string;
  /** Rendered config files, paths relative to the server data dir. */
  files: { relPath: string; content: string; merge?: boolean }[];
}

export type CommandPayload =
  | StartCommandPayload
  | StopCommandPayload
  | UpdateCommandPayload
  | SendCommandPayload
  | BackupCreateCommandPayload
  | BackupRestoreCommandPayload
  | FileReadCommandPayload
  | FileWriteCommandPayload
  | FileListCommandPayload
  | ConfigApplyCommandPayload;

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
  type:
    | "START"
    | "STOP"
    | "UPDATE"
    | "SEND_COMMAND"
    | "BACKUP_CREATE"
    | "BACKUP_RESTORE"
    | "FILE_READ"
    | "FILE_WRITE"
    | "FILE_LIST"
    | "CONFIG_APPLY";
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
