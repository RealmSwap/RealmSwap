import type { CommandPayload } from "./protocol";
import { resolveUsableNode, enqueueCommand, awaitCommandResult } from "./commands";

/**
 * Small-file operations on an AGENT server's data dir, ferried over the
 * command queue (the config editor and mod-config discovery). Paths are
 * relative to the server's data dir on the node — the same tree the START
 * command's configFiles write into. Sizes are capped agent-side (2 MB);
 * bulk movement (worlds, mod archives) uses the backup tar pipeline instead.
 */

/** One sync round trip is pickup (~5s) + execute + result on the next beat —
 *  small files land comfortably inside this. */
export const AGENT_FILE_TIMEOUT_MS = 30_000;

type FilePayload = CommandPayload & { dataDirName: string };

async function runFileCommand(serverId: string, payload: FilePayload): Promise<Record<string, unknown>> {
  const node = await resolveUsableNode(serverId);
  const { id } = await enqueueCommand(node.id, serverId, payload.kind, payload);
  const outcome = await awaitCommandResult(id, AGENT_FILE_TIMEOUT_MS);
  if (!outcome.ok) {
    throw new Error(outcome.error || `Node '${node.name}' failed the ${payload.kind} command.`);
  }
  try {
    return outcome.output ? JSON.parse(outcome.output) : {};
  } catch {
    throw new Error(`Node '${node.name}' returned an unreadable ${payload.kind} result.`);
  }
}

export async function agentReadServerFile(
  serverId: string,
  relPath: string
): Promise<{ exists: boolean; content: string | null }> {
  const out = await runFileCommand(serverId, { kind: "FILE_READ", dataDirName: serverId, relPath });
  return { exists: out.exists === true, content: (out.content as string | null) ?? null };
}

export async function agentListServerDir(
  serverId: string,
  relPath: string
): Promise<{ name: string; isDir: boolean }[]> {
  const out = await runFileCommand(serverId, { kind: "FILE_LIST", dataDirName: serverId, relPath });
  return Array.isArray(out.entries) ? (out.entries as { name: string; isDir: boolean }[]) : [];
}

export async function agentWriteServerFile(
  serverId: string,
  relPath: string,
  content: string,
  opts: { backup?: boolean } = {}
): Promise<void> {
  await runFileCommand(serverId, {
    kind: "FILE_WRITE", dataDirName: serverId, relPath, content, backup: opts.backup,
  });
}

/** Apply a rendered config set in one round trip (settings saves). Entries
 *  are data-dir-relative and merge-annotated — buildAgentConfigEntries
 *  produces them. */
export async function agentApplyConfigFiles(
  serverId: string,
  files: { relPath: string; content: string; merge?: boolean }[]
): Promise<void> {
  await runFileCommand(serverId, { kind: "CONFIG_APPLY", dataDirName: serverId, files });
}
