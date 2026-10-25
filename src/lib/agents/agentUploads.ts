import crypto from "crypto";
import fs from "fs";
import path from "path";
import { dataRoot } from "@/lib/appPaths";

/**
 * One-shot transfer registry for agent backup upload/download (the #124
 * realms-import pattern): the agent never gets a stable URL — the dashboard
 * issues an opaque id bound to a command, consumed exactly once, expiring in
 * 15 minutes. In-memory by design: a dashboard restart orphaning a staged
 * tar is a temp-file leak, not a correctness problem (orphaned files are
 * cleaned on next boot sweep... they live under dataRoot()/agent-uploads/).
 */

const TOKEN_TTL_MS = 15 * 60 * 1000;

export interface AgentTransfer {
  filePath: string;
  nodeId: string;
  serverId: string;
  expiresAt: number;
}

const g = globalThis as unknown as {
  agentUploads: Map<string, AgentTransfer> | undefined;
  agentDownloads: Map<string, AgentTransfer> | undefined;
};
if (!g.agentUploads) g.agentUploads = new Map();
if (!g.agentDownloads) g.agentDownloads = new Map();
const uploads = g.agentUploads;
const downloads = g.agentDownloads;

export function agentUploadDir(): string {
  return path.join(dataRoot(), "agent-uploads");
}

function sweep(map: Map<string, AgentTransfer>): void {
  const now = Date.now();
  for (const [id, t] of Array.from(map.entries())) {
    if (t.expiresAt < now) {
      map.delete(id);
      try { if (fs.existsSync(t.filePath)) fs.unlinkSync(t.filePath); } catch { /* best-effort */ }
    }
  }
}

/** Register a staged upload file. Returns the opaque id the agent completed
 *  its command with. Consuming removes the record (the file is the caller's). */
export function recordUpload(filePath: string, nodeId: string, serverId: string): string {
  sweep(uploads);
  const id = crypto.randomBytes(16).toString("hex");
  uploads.set(id, { filePath, nodeId, serverId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return id;
}

/** Single-use: the first take wins, everyone else gets null. */
export function takeUpload(id: string, nodeId: string, serverId: string): AgentTransfer | null {
  sweep(uploads);
  const t = uploads.get(id);
  if (!t || t.nodeId !== nodeId || t.serverId !== serverId) return null;
  uploads.delete(id);
  return t;
}

/** Issue a one-shot download token for a file the agent should pull. */
export function issueDownloadToken(filePath: string, nodeId: string, serverId: string): string {
  sweep(downloads);
  const token = crypto.randomBytes(16).toString("hex");
  downloads.set(token, { filePath, nodeId, serverId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

export function takeDownloadToken(token: string, nodeId: string, serverId: string): AgentTransfer | null {
  sweep(downloads);
  const t = downloads.get(token);
  if (!t || t.nodeId !== nodeId || t.serverId !== serverId) return null;
  downloads.delete(token);
  return t;
}

/** Drop a download token without consuming its file (orchestrator cleanup). */
export function revokeDownloadToken(token: string): void {
  downloads.delete(token);
}
