import fs from "fs";
import os from "os";
import path from "path";
import { c as tarCreate } from "tar";
import type { CommandPayload } from "./protocol";
import { resolveUsableNode, enqueueCommand, awaitCommandResult } from "./commands";
import { issueDownloadToken, revokeDownloadToken } from "./agentUploads";

/**
 * Mod-file movement for AGENT servers. The dashboard resolves and stages
 * everything (provider downloads, extractions, ini transforms) into a local
 * temp tree laid out like the server data dir, then ships it as one tar via
 * a one-shot download token — the same transfer shape as backup restores,
 * agent-side. The node tar-aside's the affected paths first, giving installs
 * an automatic rollback even though there's no sandbox boot test on a node.
 */

export const MOD_SHIP_TIMEOUT_MS = 15 * 60_000;

/** A node command failed; carries the raw result output so callers can pull
 *  a rollback snapshotId out of a failed FILES_APPLY. */
export class NodeCommandError extends Error {
  output?: string;
  constructor(message: string, output?: string) {
    super(message);
    this.output = output;
  }
}

async function runCommand(serverId: string, payload: CommandPayload, timeoutMs: number): Promise<Record<string, unknown>> {
  const node = await resolveUsableNode(serverId);
  const { id } = await enqueueCommand(node.id, serverId, (payload as { kind: string }).kind as never, payload);
  const outcome = await awaitCommandResult(id, timeoutMs);
  if (!outcome.ok) {
    throw new NodeCommandError(
      outcome.error || `Node '${node.name}' failed the ${payload.kind} command.`,
      outcome.output
    );
  }
  try {
    return outcome.output ? JSON.parse(outcome.output) : {};
  } catch {
    throw new Error(`Node '${node.name}' returned an unreadable ${payload.kind} result.`);
  }
}

export interface ShipOptions {
  /** Data-dir-relative paths to remove on the node before overlaying. */
  deletes?: string[];
  /** Data-dir-relative dirs/files the node tar-asides for rollback. */
  backupPaths?: string[];
}

export interface ShipResult {
  /** Snapshot id for rollbackAgentModShip — undefined when nothing existed to back up. */
  snapshotId?: string;
}

/** Ship a staged tree to the node's copy of the server data dir. The staging
 *  root's layout must already match the data dir (e.g. `mods/<pkg>.jar`,
 *  `valheim-server/BepInEx/plugins/<pkg>/...`). On failure the thrown
 *  NodeCommandError carries the rollback snapshotId (when the node took one)
 *  and the caller's `clearPaths` are the deletes that were requested. */
export async function shipModTree(serverId: string, stagingRoot: string, opts: ShipOptions = {}): Promise<ShipResult> {
  const node = await resolveUsableNode(serverId);
  const tarPath = path.join(os.tmpdir(), `rs-ship-${serverId}-${Date.now()}.tar`);
  try {
    await tarCreate({ file: tarPath, cwd: stagingRoot, portable: true }, ["."]);
    const token = issueDownloadToken(tarPath, node.id, serverId);
    try {
      const out = await runCommand(serverId, {
        kind: "FILES_APPLY",
        dataDirName: serverId,
        downloadPath: `/api/agents/download/${token}?serverId=${serverId}`,
        deletes: opts.deletes,
        backupPaths: opts.backupPaths,
      }, MOD_SHIP_TIMEOUT_MS);
      return { snapshotId: typeof out.snapshotId === "string" ? out.snapshotId : undefined };
    } finally {
      revokeDownloadToken(token);
    }
  } finally {
    try { fs.unlinkSync(tarPath); } catch { /* best-effort */ }
  }
}

/** Tar-aside paths on the node without shipping anything — the pre-step for
 *  installer runs that happen ON the node. Returns the rollback id, or
 *  undefined when nothing existed to snapshot. */
export async function snapshotNodePaths(serverId: string, backupPaths: string[]): Promise<string | undefined> {
  const out = await runCommand(serverId, {
    kind: "PATHS_SNAPSHOT", dataDirName: serverId, backupPaths,
  }, AGENT_FILEISH_TIMEOUT_MS);
  return typeof out.snapshotId === "string" ? out.snapshotId : undefined;
}

/** Overlay the node-side pre-install tar back (auto-rollback path).
 *  `clearPaths` are the rel paths the failed ship added. */
export async function rollbackAgentModShip(serverId: string, snapshotId: string, clearPaths: string[] = []): Promise<void> {
  await runCommand(serverId, {
    kind: "FILES_RESTORE", dataDirName: serverId, snapshotId, clearPaths,
  }, MOD_SHIP_TIMEOUT_MS);
}

/** Delete paths on the node (uninstalls that ship nothing back). */
export async function deleteNodePaths(serverId: string, paths: string[]): Promise<void> {
  await runCommand(serverId, { kind: "FILE_DELETE", dataDirName: serverId, paths }, AGENT_FILEISH_TIMEOUT_MS);
}

const AGENT_FILEISH_TIMEOUT_MS = 60_000;

/** Run a fully-resolved `bash -lc` command in a throwaway container with the
 *  server data dir at /data (SteamCMD workshop downloads, loader installers). */
export async function runNodeContainer(
  serverId: string,
  image: string,
  cmd: string,
  timeoutMs = 15 * 60_000
): Promise<string> {
  const out = await runCommand(serverId, { kind: "DOCKER_RUN", dataDirName: serverId, image, cmd, timeoutMs }, timeoutMs);
  return typeof out.output === "string" ? out.output : "";
}

export interface ScannedNodeFile {
  relPath: string;
  fields: Record<string, string>;
}

/** Recursively find files by name under a data-dir-relative dir and pull
 *  regex fields out of them (mod.info id=/name= derivation, on-node). */
export async function scanNodeFiles(
  serverId: string,
  relDir: string,
  fileName: string,
  patterns: { key: string; regex: string }[]
): Promise<ScannedNodeFile[]> {
  const out = await runCommand(serverId, {
    kind: "DIR_SCAN", dataDirName: serverId, relDir, fileName, patterns,
  }, AGENT_FILEISH_TIMEOUT_MS);
  return Array.isArray(out.files) ? (out.files as ScannedNodeFile[]) : [];
}

/** A fresh staging root laid out like the server data dir; callers extract
 *  downloads into it and pass it to shipModTree. */
export async function makeModStagingRoot(serverId: string): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `rs-modstage-${serverId}-`));
  return root;
}
