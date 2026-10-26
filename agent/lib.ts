/**
 * Pure pieces of the agent, split out of agent.ts (which self-executes main)
 * so they can be unit-tested: config-file writing with the traversal guard,
 * docker argv building, stats parsing, and the response-signature check.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { mergeConfigContent } from "../src/lib/definitions/mergeConfig";
import type { StartCommandPayload } from "../src/lib/agents/protocol";

/** Resolve relPath inside the server data dir with the same traversal guard
 *  writeConfigFiles uses, but allowing the data dir itself ("" lists the
 *  root). Returns null when the path escapes. */
export function resolveInDataDir(dataDir: string, relPath: string): string | null {
  const root = path.resolve(dataDir);
  const resolved = path.resolve(path.join(dataDir, relPath));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/** Write dashboard-rendered config files under the server data dir.
 *  Refuses anything that escapes the dir (defense in depth — the payload is
 *  HMAC-authenticated, but the agent never writes outside its own tree).
 *  `merge: true` entries merge into an existing file instead of overwriting
 *  it, mirroring applyConfigFiles on the local runners — otherwise every
 *  start would clobber raw-editor edits made on the node. */
export function writeConfigFiles(
  dataDir: string,
  configFiles: StartCommandPayload["configFiles"],
): { ok: true; written: number } | { ok: false; error: string } {
  fs.mkdirSync(dataDir, { recursive: true });
  const root = path.resolve(dataDir);
  let written = 0;
  for (const cf of configFiles ?? []) {
    const resolved = path.resolve(path.join(dataDir, cf.relPath));
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      return { ok: false, error: `Config path escapes the server data dir: ${cf.relPath}` };
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, mergeFileContent(resolved, cf.content, cf.merge), "utf-8");
    written++;
  }
  return { ok: true, written };
}

/** The single merge/overwrite decision every config write shares: overwrite
 *  by default, merge when asked AND a previous file exists to merge into. */
function mergeFileContent(absPath: string, content: string, merge?: boolean): string {
  if (!merge || !fs.existsSync(absPath)) return content;
  try {
    return mergeConfigContent(fs.readFileSync(absPath, "utf-8"), content);
  } catch {
    return content; // unreadable existing file — regenerate, like applyConfigFiles
  }
}

/** Config-editor file cap: these ride the command channel as JSON, so a
 *  multi-GB file (a world, a jar) must refuse instead of smuggling through. */
const MAX_FERRY_BYTES = 2 * 1024 * 1024;

export function readServerFile(
  dataDir: string,
  relPath: string,
): { ok: true; exists: boolean; content: string | null } | { ok: false; error: string } {
  const abs = resolveInDataDir(dataDir, relPath);
  if (!abs) return { ok: false, error: `File path escapes the server data dir: ${relPath}` };
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { ok: true, exists: false, content: null };
  if (fs.statSync(abs).size > MAX_FERRY_BYTES) {
    return { ok: false, error: `File is too large to edit over the agent channel (${relPath})` };
  }
  return { ok: true, exists: true, content: fs.readFileSync(abs, "utf-8") };
}

export function writeServerFile(
  dataDir: string,
  relPath: string,
  content: string,
  backup?: boolean,
): { ok: true; written: number } | { ok: false; error: string } {
  const abs = resolveInDataDir(dataDir, relPath);
  if (!abs) return { ok: false, error: `File path escapes the server data dir: ${relPath}` };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (backup && fs.existsSync(abs)) {
    try { fs.copyFileSync(abs, `${abs}.rsbak`); } catch { /* best-effort, like the local editor */ }
  }
  fs.writeFileSync(abs, content, "utf-8");
  return { ok: true, written: Buffer.byteLength(content, "utf-8") };
}

export function listServerDir(
  dataDir: string,
  relPath: string,
): { ok: true; entries: { name: string; isDir: boolean }[] } | { ok: false; error: string } {
  const abs = resolveInDataDir(dataDir, relPath);
  if (!abs) return { ok: false, error: `Directory path escapes the server data dir: ${relPath}` };
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return { ok: true, entries: [] };
  const entries = fs
    .readdirSync(abs, { withFileTypes: true })
    .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, entries };
}

/** Apply a rendered config set (settings saves): same merge semantics as
 *  writeConfigFiles, paths already relative to the server data dir. */
export function applyConfigEntries(
  dataDir: string,
  files: { relPath: string; content: string; merge?: boolean }[],
): { ok: true; written: number } | { ok: false; error: string } {
  return writeConfigFiles(dataDir, files);
}

/** Delete data-dir-relative paths (files or dirs). Unknown paths are
 *  skipped — uninstalls target files a newer version may have renamed. */
export function deletePathsInDataDir(
  dataDir: string,
  relPaths: string[],
): { ok: true; deleted: string[] } | { ok: false; error: string } {
  const deleted: string[] = [];
  for (const rel of relPaths) {
    const abs = resolveInDataDir(dataDir, rel);
    if (!abs) return { ok: false, error: `Delete path escapes the server data dir: ${rel}` };
    try {
      if (!fs.existsSync(abs)) continue;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) fs.rmSync(abs, { recursive: true, force: true });
      else fs.unlinkSync(abs);
      deleted.push(rel);
    } catch (err: any) {
      return { ok: false, error: `Failed to delete ${rel}: ${err?.message ?? err}` };
    }
  }
  return { ok: true, deleted };
}

export interface ScannedFile {
  relPath: string;
  fields: Record<string, string>;
}

/** Recursively find files by basename under a data-dir subdirectory and
 *  extract the first regex capture from each file per pattern (multiline) —
 *  the generic read-back for downloads that ran on the node (e.g. `id=`
 *  lines from mod.info files inside Steam Workshop content). */
export function scanTreeFor(
  dataDir: string,
  relDir: string,
  fileName: string,
  patterns: { key: string; regex: string }[],
): { ok: true; files: ScannedFile[] } | { ok: false; error: string } {
  const rootAbs = resolveInDataDir(dataDir, relDir);
  if (!rootAbs) return { ok: false, error: `Scan dir escapes the server data dir: ${relDir}` };
  let compiled: { key: string; re: RegExp }[];
  try {
    compiled = patterns.map((p) => ({ key: p.key, re: new RegExp(p.regex, "m") }));
  } catch {
    return { ok: false, error: "Invalid scan pattern." };
  }
  const files: ScannedFile[] = [];
  const walk = (absDir: string, relBase: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // unreadable subdir — skip, not fail
    }
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name === fileName) {
        const fields: Record<string, string> = {};
        try {
          const content = fs.readFileSync(abs, "utf-8");
          for (const { key, re } of compiled) {
            const match = content.match(re);
            if (match?.[1] !== undefined) fields[key] = match[1].trim();
          }
        } catch { /* unreadable — report the file without fields */ }
        files.push({ relPath: rel, fields });
      }
    }
  };
  if (fs.existsSync(rootAbs)) walk(rootAbs, "");
  return { ok: true, files };
}

/** Rollback tars kept for FILES_APPLY: id + safe file name on the agent. */
export function modSnapshotTarName(serverId: string, snapshotId: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(snapshotId)) return null;
  return `modsnap-${serverId}-${snapshotId}.tar`;
}

// ─── Playit tunnel daemons ──────────────────────────────────────────────────

/** Where the agent keeps the playit binary + per-server daemon state. */
export function tunnelBinPath(stateDir: string): string {
  return path.join(stateDir, "bin", process.platform === "win32" ? "playit.exe" : "playit");
}

export function tunnelSecretPath(stateDir: string, serverId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(serverId)) throw new Error("Invalid server id.");
  return path.join(stateDir, `playit-${serverId}.toml`);
}

export function tunnelSocketPath(stateDir: string, serverId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(serverId)) throw new Error("Invalid server id.");
  return process.platform === "win32"
    ? `\\\\.\\pipe\\realmswap-agent-playitd-${serverId}`
    : path.join(stateDir, `playitd-${serverId}.sock`);
}

export function tunnelPidPath(stateDir: string, serverId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(serverId)) throw new Error("Invalid server id.");
  return path.join(stateDir, `playit-${serverId}.pid`);
}

/** Stream a URL to a .part file and rename it into place (atomic-ish
 *  download for the playit binary; chmod happens caller-side on POSIX). */
export async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000), redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Binary download failed (${res.status}).`);
  const { Readable } = await import("stream");
  const { pipeline } = await import("stream/promises");
  await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(`${destPath}.part`));
  fs.renameSync(`${destPath}.part`, destPath);
}

/** Kill daemons orphaned by a dead agent run (pid files mirror the local
 *  dashboard's boot reconcile). Pids that are our own children are skipped —
 *  the caller passes its tracked map. */
export function reconcileTunnelOrphans(
  stateDir: string,
  tracked: Map<string, unknown>
): void {
  let names: string[];
  try {
    names = fs.readdirSync(stateDir);
  } catch {
    return;
  }
  for (const name of names) {
    const match = /^playit-(.+)\.pid$/.exec(name);
    if (!match) continue;
    const serverId = match[1];
    if (tracked.has(serverId)) continue;
    const pidPath = path.join(stateDir, name);
    try {
      const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
        } catch { /* already gone */ }
      }
    } catch { /* unreadable — clean up below */ }
    try { fs.unlinkSync(pidPath); } catch { /* best-effort */ }
  }
}

export interface DiskUsageBucket {
  name: string;
  prefixes: string[];
}

export interface DiskUsageResult {
  totalBytes: number;
  buckets: Record<string, number>;
}

/** One walk of the server data dir, classifying every file into the
 *  dashboard-supplied buckets by longest matching prefix (lowercase, POSIX,
 *  relative to the data dir — same rule as storageUsage.classifyServerDir,
 *  but the prefix lists travel with the command so the agent stays
 *  game-agnostic). Unmatched files simply don't appear in any bucket; the
 *  dashboard's "other" is total − Σbuckets. */
export function walkDiskUsage(
  dataDir: string,
  buckets: DiskUsageBucket[],
): { ok: true; usage: DiskUsageResult } | { ok: false; error: string } {
  const root = path.resolve(dataDir);
  if (!fs.existsSync(root)) return { ok: false, error: "Server data dir does not exist." };
  const compiled = buckets.map((b) => ({
    name: b.name,
    prefixes: (b.prefixes ?? []).map((p) => p.replace(/\\/g, "/").toLowerCase()),
  }));
  const usage: DiskUsageResult = { totalBytes: 0, buckets: {} };
  for (const b of compiled) usage.buckets[b.name] = 0;

  const classify = (rel: string): string | null => {
    const norm = rel.replace(/\\/g, "/").toLowerCase();
    let best: { name: string; len: number } | null = null;
    for (const b of compiled) {
      for (const prefix of b.prefixes) {
        const matches = norm === prefix || norm.startsWith(prefix + "/");
        if (matches && (!best || prefix.length > best.len)) best = { name: b.name, len: prefix.length };
      }
    }
    return best?.name ?? null;
  };

  const stack: { abs: string; rel: string }[] = [{ abs: root, rel: "" }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.abs, { withFileTypes: true });
    } catch {
      continue; // unreadable dir — count what we can reach
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const abs = path.join(current.abs, entry.name);
      const rel = current.rel ? `${current.rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        stack.push({ abs, rel });
      } else if (entry.isFile()) {
        try {
          const size = fs.statSync(abs).size;
          usage.totalBytes += size;
          const bucket = classify(rel);
          if (bucket) usage.buckets[bucket] += size;
        } catch {
          // raced away (deleted mid-walk) — skip
        }
      }
    }
  }
  return { ok: true, usage };
}

/** docker run argv for a START payload — mirrors buildRunArgs in dockerCli.ts. */
export function buildDockerRunArgs(p: StartCommandPayload, dataDir: string): string[] {
  const args = ["run", "-d", "--name", p.containerName, "-v", `${dataDir}:/data`];
  for (const port of p.ports ?? []) {
    args.push("-p", `${port.port}:${port.port}/${String(port.protocol).toLowerCase()}`);
  }
  if (p.env) for (const [k, v] of Object.entries(p.env)) args.push("-e", `${k}=${v}`);
  args.push(p.image, "bash", "-lc", p.entrypoint);
  return args;
}

/** Parse `docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}}"`. */
export function parseStatsLine(output: string): { cpuPercent: number; memoryMB: number } | null {
  const trimmed = output.trim();
  if (!trimmed) return null;
  const [cpuStr = "", memPart = ""] = trimmed.split(",");
  const cpuPercent = parseFloat(cpuStr.replace("%", "")) || 0;
  const memUsed = memPart.split("/")[0]?.trim() ?? "";
  const m = memUsed.match(/^([\d.]+)\s*([KMGT]?i?B)?$/i);
  let memoryMB = 0;
  if (m) {
    const value = parseFloat(m[1]);
    const unit = (m[2] || "MiB").toLowerCase();
    if (unit.startsWith("k")) memoryMB = value / 1024;
    else if (unit.startsWith("g")) memoryMB = value * 1024;
    else if (unit.startsWith("t")) memoryMB = value * 1024 * 1024;
    else memoryMB = value;
  }
  return { cpuPercent, memoryMB };
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** tar argv for an upload (system tar — Linux + Windows 10+ bsdtar). */
export function buildTarArgs(baseDir: string, entries: string[], tarPath: string): string[] {
  return ["-cf", tarPath, "-C", baseDir, ...entries];
}

/**
 * Install a staged restore tree onto the live one with the atomicFs
 * semantics the dashboard uses: rename-swap with rollback for `swap` mode
 * (world dir replaced wholesale), pure overlay for `overlay` mode (Valheim's
 * worlds dir holds other worlds — files are added/overwritten, never
 * deleted). Returns the rollback of a failed swap itself.
 */
export function installStagedTree(
  stagedDir: string,
  destDir: string,
  mode: "swap" | "overlay",
): { ok: true } | { ok: false; error: string } {
  try {
    if (mode === "overlay") {
      overlayDir(stagedDir, destDir);
      return { ok: true };
    }
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    const backupDir = `${destDir}.pre-restore`;
    fs.rmSync(backupDir, { recursive: true, force: true });
    let swapped = false;
    if (fs.existsSync(destDir)) {
      fs.renameSync(destDir, backupDir);
      swapped = true;
    }
    try {
      fs.renameSync(stagedDir, destDir);
    } catch (err: any) {
      if (swapped) {
        try { fs.renameSync(backupDir, destDir); } catch { /* best-effort rollback */ }
      }
      return { ok: false, error: `Failed to swap restored world into place: ${err?.message ?? err}` };
    }
    fs.rmSync(backupDir, { recursive: true, force: true });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

function overlayDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) overlayDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}
