import fs from "fs";
import os from "os";
import path from "path";
import * as tar from "tar";
import { enqueueCommand, awaitCommandResult, resolveUsableNode } from "./commands";
import { takeUpload, issueDownloadToken, revokeDownloadToken } from "./agentUploads";
import type { CommandPayload } from "./protocol";

/**
 * World export/import for AGENT servers — the #142 backup file-movement
 * primitives pointed at whole-server trees and per-game save dirs:
 *
 * Export: the node tars its ENTIRE server data dir (BACKUP_CREATE with
 * srcRelDir "."), the dashboard stages the upload, drops in the realm.json
 * manifest, and the route streams the gzipped tar as the .realm attachment.
 *
 * Import: the dashboard validates the source per game, tars it with the
 * layout the destination expects, and the agent pulls it via a one-shot
 * token and swaps/overlays it into the save dir — the exact mechanics of
 * backup restore, keyed to getSavePath's DOCKER layout (identical to the
 * agent's on-disk layout).
 */

const TRANSFER_TIMEOUT_MS = 30 * 60_000;

/** Stage the node's whole server tree locally; caller cleans up the dir. */
export async function stageAgentServerTree(serverId: string): Promise<string> {
  const node = await resolveUsableNode(serverId);
  const { id } = await enqueueCommand(node.id, serverId, "BACKUP_CREATE", {
    kind: "BACKUP_CREATE",
    dataDirName: serverId,
    srcRelDir: ".",
    uploadPath: `/api/agents/upload?serverId=${serverId}`,
  } satisfies CommandPayload);
  const outcome = await awaitCommandResult(id, TRANSFER_TIMEOUT_MS);
  if (!outcome.ok) {
    throw new Error(outcome.error || `Node '${node.name}' failed to stage the server files.`);
  }
  let uploadId: string | undefined;
  try { uploadId = JSON.parse(outcome.output ?? "{}").uploadId; } catch { /* below */ }
  if (!uploadId) throw new Error("Node did not return an upload id for the staged server tree.");
  const transfer = takeUpload(uploadId, node.id, serverId);
  if (!transfer) throw new Error("Staged server tree expired or belonged to another node.");

  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), `rs-realm-${serverId}-`));
  await tar.x({ file: transfer.filePath, cwd: stageDir });
  return stageDir;
}

export interface ImportPlan {
  destRelDir: string;
  mode: "swap" | "overlay";
  /** Files placed at the tar root (overlay imports); null = tar a directory. */
  files?: string[];
}

/** Per-game import plan: same validation refusals as the local route, mapped
 *  onto BACKUP_RESTORE destinations (getSavePath's DOCKER layout = the
 *  agent's layout). Null = honest client-facing refusal message. */
export function planAgentWorldImport(
  game: string,
  sourcePath: string,
  isDir: boolean
): { ok: true; plan: ImportPlan } | { ok: false; message: string } {
  if (game === "MINECRAFT") {
    if (!isDir) return { ok: false, message: "Minecraft world import requires a folder (not a file)." };
    if (!fs.existsSync(path.join(sourcePath, "level.dat"))) {
      return { ok: false, message: "Invalid Minecraft world folder. A valid world folder must contain a 'level.dat' file." };
    }
    return { ok: true, plan: { destRelDir: "world", mode: "swap" } };
  }

  if (game === "VALHEIM") {
    const files: string[] = [];
    if (isDir) {
      for (const f of fs.readdirSync(sourcePath)) {
        if (f.endsWith(".db") || f.endsWith(".fwl")) files.push(f);
      }
      if (files.length === 0) {
        return { ok: false, message: "No Valheim world files (.db or .fwl) found in folder." };
      }
    } else {
      const ext = path.extname(sourcePath);
      if (ext !== ".db" && ext !== ".fwl") {
        return { ok: false, message: "Valheim saves must have a .db or .fwl extension." };
      }
      const basename = path.basename(sourcePath, ext);
      files.push(path.basename(sourcePath));
      // The .fwl companion names the world — without it the save won't list.
      const paired = path.join(path.dirname(sourcePath), basename + (ext === ".db" ? ".fwl" : ".db"));
      if (fs.existsSync(paired)) files.push(path.basename(paired));
    }
    const dest = "valheim-data/.config/IronGate/Valheim/worlds_local";
    return {
      ok: true,
      plan: {
        destRelDir: dest,
        mode: "overlay",
        files,
      },
    };
  }

  if (game === "ENSHROUDED") {
    return {
      ok: true,
      plan: isDir
        ? { destRelDir: "enshrouded-server/savegame", mode: "swap" }
        : { destRelDir: "enshrouded-server/savegame", mode: "overlay", files: [path.basename(sourcePath)] },
    };
  }

  if (game === "ZOMBOID") {
    if (!isDir) {
      return { ok: false, message: "Project Zomboid saves require a folder containing sandbox configurations and map files." };
    }
    return { ok: true, plan: { destRelDir: "zomboid-server/zomboid-data/Saves/Multiplayer/servertest", mode: "swap" } };
  }

  if (game === "ARK") {
    return {
      ok: true,
      plan: isDir
        ? { destRelDir: "ark-server/ShooterGame/Saved/SavedArksLocal", mode: "swap" }
        : { destRelDir: "ark-server/ShooterGame/Saved/SavedArksLocal", mode: "overlay", files: [path.basename(sourcePath)] },
    };
  }

  return { ok: false, message: `Map imports are not supported for this game on remote-node servers.` };
}

/** Validate + ship a world import to the node. Throws with client-facing
 *  messages; node-side failures propagate (the swap is staged agent-side,
 *  so a failure leaves the live world untouched). */
export async function importAgentWorld(
  serverId: string,
  game: string,
  sourcePath: string,
  isDir: boolean
): Promise<void> {
  const planned = planAgentWorldImport(game, sourcePath, isDir);
  if (!planned.ok) throw new Error(planned.message);
  const { destRelDir, mode, files } = planned.plan;

  const node = await resolveUsableNode(serverId);
  const tarPath = path.join(os.tmpdir(), `rs-world-${serverId}-${Date.now()}.tar`);
  try {
    if (files) {
      // Overlay imports: selected files at the tar root.
      await tar.c({ file: tarPath, cwd: path.dirname(sourcePath), portable: true }, files);
    } else {
      // Directory swaps: contents at the tar root (tar -C source .).
      await tar.c({ file: tarPath, cwd: sourcePath, portable: true }, ["."]);
    }
    const token = issueDownloadToken(tarPath, node.id, serverId);
    try {
      const { id } = await enqueueCommand(node.id, serverId, "BACKUP_RESTORE", {
        kind: "BACKUP_RESTORE",
        dataDirName: serverId,
        destRelDir,
        downloadPath: `/api/agents/download/${token}?serverId=${serverId}`,
        mode,
      } satisfies CommandPayload);
      const outcome = await awaitCommandResult(id, TRANSFER_TIMEOUT_MS);
      if (!outcome.ok) {
        throw new Error(outcome.error || `Node '${node.name}' failed the world import.`);
      }
    } finally {
      revokeDownloadToken(token);
    }
  } finally {
    try { fs.unlinkSync(tarPath); } catch { /* best-effort */ }
  }
}
