import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { parseSteamProgress, isMissingConfigError } from "../downloadProgress";

/**
 * One SteamCMD `app_update` for the local Windows runner, shared by first
 * install, manual update and the overnight update window so the three can't
 * drift in how they retry and report.
 *
 * SteamCMD keeps its own cache beside steamcmd.exe: `appcache/` (app metadata)
 * and `config/config.vdf` (connection-manager list). A cache written during a
 * flaky Steam session makes every later run time out on "Waiting for client
 * config" ("Info request for AppId 7 returned error Timeout", exit 8) until the
 * cache is deleted — retrying alone never recovers. The first timeout-class
 * failure therefore resets that cache before the retry. Logins are always
 * anonymous, so nothing of the user's is lost.
 */

export type SteamFailureClass = "fatal" | "cache" | "transient";

export type SteamAppUpdateResult = {
  attempts: number;
  alreadyUpToDate: boolean;
  cacheReset: boolean;
};

export class SteamAppUpdateError extends Error {
  readonly code: number | null;
  readonly detail: string;
  readonly attempts: number;
  readonly cacheReset: boolean;
  readonly failureClass: SteamFailureClass;

  constructor(
    message: string,
    info: { code: number | null; detail: string; attempts: number; cacheReset: boolean; failureClass: SteamFailureClass }
  ) {
    super(message);
    this.name = "SteamAppUpdateError";
    this.code = info.code;
    this.detail = info.detail;
    this.attempts = info.attempts;
    this.cacheReset = info.cacheReset;
    this.failureClass = info.failureClass;
  }
}

export type SteamAppUpdateOptions = {
  steamcmdExe: string;
  installDir: string;
  appId: string;
  onLog: (msg: string) => void;
  onProgress?: (percent: number) => void;
  /** Called before each retry so callers can reset their progress label. */
  onRetry?: (nextAttempt: number) => void;
  /** A non-zero exit still counts as success when this returns true (install: the exe landed). */
  successCheck?: () => boolean;
  /** Log prefixes for SteamCMD's own lines; omit `status` to stay quiet about progress. */
  tags?: { error?: string; status?: string };
  maxAttempts?: number;
  /** Delay before attempt n+1 is backoffMs[n-1]; the last entry repeats. */
  backoffMs?: number[];
};

export type SteamAppUpdateDeps = {
  spawnImpl?: typeof spawn;
  exists?: (p: string) => boolean;
  remove?: (p: string) => void;
  sleep?: (ms: number) => Promise<void>;
};

const FATAL_LINE = /No subscription|Invalid Password|Disk write failure|not enough (free )?(disk )?space|Insufficient disk/i;
const CACHE_LINE = /returned error Timeout|Timed out|Missing configuration|Waiting for client config/i;
const ERROR_LINE = /ERROR!|Failed to install|No subscription|Invalid Password|Disk write failure/i;
const STATUS_LINE = /progress|Downloading|Update state|Success/;

const DEFAULT_BACKOFF_MS = [3000, 10000];

export function classifySteamFailure(code: number | null, detail: string): SteamFailureClass {
  const text = detail || "";
  if (FATAL_LINE.test(text)) return "fatal";
  if (isMissingConfigError(code, text) || CACHE_LINE.test(text)) return "cache";
  return "transient";
}

export function steamCmdCachePaths(steamcmdExe: string): string[] {
  const dir = path.dirname(steamcmdExe);
  return [path.join(dir, "appcache"), path.join(dir, "config", "config.vdf")];
}

/** Deletes SteamCMD's cache files; returns the basenames actually removed. */
export function resetSteamCmdCache(steamcmdExe: string, deps: SteamAppUpdateDeps = {}): string[] {
  const exists = deps.exists ?? fs.existsSync;
  const remove = deps.remove ?? ((p: string) => fs.rmSync(p, { recursive: true, force: true }));
  const removed: string[] = [];
  for (const p of steamCmdCachePaths(steamcmdExe)) {
    if (!exists(p)) continue;
    remove(p);
    removed.push(path.basename(p));
  }
  return removed;
}

type RunOutcome = {
  code: number | null;
  detail: string;
  alreadyUpToDate: boolean;
  spawnError?: Error;
};

function runOnce(opts: SteamAppUpdateOptions, deps: SteamAppUpdateDeps): Promise<RunOutcome> {
  const spawnFn = deps.spawnImpl ?? spawn;
  const errorTag = opts.tags?.error ?? "[SteamCMD Error]";
  const statusTag = opts.tags?.status;
  const cleanInstallDir = opts.installDir.replace(/\\/g, "/");

  return new Promise((resolve) => {
    let detail = "";
    let alreadyUpToDate = false;
    let settled = false;
    const finish = (outcome: RunOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const child = spawnFn(opts.steamcmdExe, [
      "+force_install_dir", cleanInstallDir,
      "+login", "anonymous",
      // Refreshes the app-metadata cache first; without it a cold cache fails
      // with "Missing configuration" (exit 8).
      "+app_info_update", "1",
      "+app_update", opts.appId,
      "validate",
      "+quit",
    ]);

    child.stdout?.on("data", (data: Buffer | string) => {
      for (const raw of data.toString().split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const pct = parseSteamProgress(line);
        if (pct !== null) opts.onProgress?.(pct);
        if (/already up to date/i.test(line)) alreadyUpToDate = true;
        if (ERROR_LINE.test(line)) {
          detail = line;
          opts.onLog(`${errorTag} ${line}`);
        } else if (statusTag && STATUS_LINE.test(line)) {
          opts.onLog(`${statusTag} ${line}`);
        }
      }
    });

    child.stderr?.on("data", (data: Buffer | string) => {
      const line = data.toString().replace(/[\r\n]+/g, " ").trim();
      if (!line) return;
      detail = detail || line;
      opts.onLog(`[SteamCMD] ${line}`);
    });

    child.on("error", (err: Error) => finish({ code: null, detail, alreadyUpToDate, spawnError: err }));
    child.on("close", (code: number | null) => finish({ code, detail, alreadyUpToDate }));
  });
}

export async function runSteamAppUpdate(
  opts: SteamAppUpdateOptions,
  deps: SteamAppUpdateDeps = {}
): Promise<SteamAppUpdateResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const backoff = opts.backoffMs && opts.backoffMs.length > 0 ? opts.backoffMs : DEFAULT_BACKOFF_MS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let cacheReset = false;
  let last: RunOutcome = { code: null, detail: "", alreadyUpToDate: false };
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const run = await runOnce(opts, deps);

    if (run.spawnError) {
      throw new SteamAppUpdateError(`SteamCMD failed to start: ${run.spawnError.message}`, {
        code: null,
        detail: run.spawnError.message,
        attempts,
        cacheReset,
        failureClass: "fatal",
      });
    }
    if (run.code === 0 || opts.successCheck?.()) {
      return { attempts, alreadyUpToDate: run.alreadyUpToDate, cacheReset };
    }

    last = run;
    const failureClass = classifySteamFailure(run.code, run.detail);
    if (failureClass === "fatal" || attempts >= maxAttempts) break;

    const exit = `exit ${run.code ?? "?"}${run.detail ? `: ${run.detail}` : ""}`;
    const waitMs = backoff[Math.min(attempts - 1, backoff.length - 1)];
    if (failureClass === "cache" && !cacheReset) {
      const removed = resetSteamCmdCache(opts.steamcmdExe, deps);
      cacheReset = true;
      const what = removed.length > 0 ? removed.join(" and ") : "the SteamCMD cache";
      opts.onLog(
        `[SteamCMD] Steam didn't answer the app-info request (${exit}). ` +
          `This is usually a stale SteamCMD cache — reset ${what}; retrying (attempt ${attempts + 1}/${maxAttempts})…`
      );
    } else {
      opts.onLog(
        `[SteamCMD] Attempt ${attempts}/${maxAttempts} failed (${exit}). Retrying in ${Math.round(waitMs / 1000)}s…`
      );
    }
    opts.onRetry?.(attempts + 1);
    await sleep(waitMs);
  }

  const failureClass = classifySteamFailure(last.code, last.detail);
  const detail = last.detail ? ` - ${last.detail}` : " (see steamcmd/logs/console_log.txt for details)";
  const tries = attempts > 1 ? ` after ${attempts} attempts` : "";
  const hint =
    failureClass === "fatal"
      ? ""
      : cacheReset
        ? " SteamCMD's cache was already reset automatically, so Steam itself may be having problems — check steamstat.us and try again in a few minutes."
        : " Steam may be having problems — check steamstat.us and try again in a few minutes.";
  throw new SteamAppUpdateError(
    `SteamCMD update for app ${opts.appId} exited with code ${last.code}${tries}${detail}.${hint}`,
    { code: last.code, detail: last.detail, attempts, cacheReset, failureClass }
  );
}
