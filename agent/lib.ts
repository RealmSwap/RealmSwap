/**
 * Pure pieces of the agent, split out of agent.ts (which self-executes main)
 * so they can be unit-tested: config-file writing with the traversal guard,
 * docker argv building, stats parsing, and the response-signature check.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { StartCommandPayload } from "../src/lib/agents/protocol";

/** Write dashboard-rendered config files under the server data dir.
 *  Refuses anything that escapes the dir (defense in depth — the payload is
 *  HMAC-authenticated, but the agent never writes outside its own tree). */
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
    fs.writeFileSync(resolved, cf.content, "utf-8");
    written++;
  }
  return { ok: true, written };
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
