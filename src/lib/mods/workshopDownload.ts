import fs from "fs";
import path from "path";
import { spawn } from "child_process";

/**
 * Workshop item download via SteamCMD and Project Zomboid mod-ID derivation.
 *
 * PZ workshop items are depot-hosted (the Web API exposes no file_url), so
 * the item is fetched anonymously with `+workshop_download_item` into the
 * server's own Steam dir — the same location the dedicated server checks
 * at boot, so the download doubles as a pre-cache.
 *
 * The ini Mod ID for `Mods=` is NOT derivable from the Web API: it lives in
 * the `id=` line of each `mod.info` inside the item (verified against a real
 * download: workshop 2875848298 ships mods/CommonSense/mod.info with
 * id=BB_CommonSense — the id and the folder name differ). One item may carry
 * several mod folders, so derivation returns every mod.info found.
 */

const STEAMCMD_TIMEOUT_MS = 10 * 60 * 1000;

export interface DownloadWorkshopDeps {
  steamcmdExe?: string;
  spawnImpl?: typeof spawn;
}

async function resolveSteamCmdExe(onLog: (msg: string) => void): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("Steam Workshop installs require a Windows host (SteamCMD is only set up there).");
  }
  // Dynamic import: LocalRunner is a heavy module and only needed on the
  // Windows runtime path.
  const { setupSteamCMD } = await import("@/lib/runners/LocalRunner");
  return setupSteamCMD(onLog);
}

/**
 * Download one workshop item and return its content directory
 * `<installDir>/steamapps/workshop/content/<appId>/<workshopId>`.
 */
export async function downloadWorkshopItem(opts: {
  appId: number;
  workshopId: string;
  installDir: string;
  onLog?: (msg: string) => void;
  deps?: DownloadWorkshopDeps;
}): Promise<string> {
  const onLog = opts.onLog ?? (() => {});
  const exe = opts.deps?.steamcmdExe ?? (await resolveSteamCmdExe(onLog));

  const contentDir = path.join(
    opts.installDir, "steamapps", "workshop", "content", String(opts.appId), opts.workshopId
  );

  await runSteamCmd(exe, [
    "+force_install_dir", opts.installDir,
    "+login", "anonymous",
    "+workshop_download_item", String(opts.appId), opts.workshopId,
    "+quit",
  ], onLog, opts.deps, `downloading item ${opts.workshopId}`);

  if (!fs.existsSync(contentDir)) {
    throw new Error(
      `SteamCMD finished but the item content was not found at ${contentDir} — the item may be region-locked or deleted.`
    );
  }
  onLog(`Workshop item ${opts.workshopId} downloaded.`);
  return contentDir;
}

/**
 * Install/update a whole Steam app via anonymous SteamCMD (e.g. the tModLoader
 * dedicated server, app 1281930). Mirrors downloadWorkshopItem's logging,
 * timeout and win32 gating; `validate` adds a depot check pass.
 */
export async function installSteamApp(opts: {
  appId: number;
  installDir: string;
  validate?: boolean;
  onLog?: (msg: string) => void;
  deps?: DownloadWorkshopDeps;
}): Promise<void> {
  const onLog = opts.onLog ?? (() => {});
  const exe = opts.deps?.steamcmdExe ?? (await resolveSteamCmdExe(onLog));
  await runSteamCmd(exe, [
    "+force_install_dir", opts.installDir,
    "+login", "anonymous",
    "+app_update", String(opts.appId), ...(opts.validate ? ["validate"] : []),
    "+quit",
  ], onLog, opts.deps, `installing app ${opts.appId}`);
}

/** Shared SteamCMD child-process runner: line logging, hard timeout, non-zero exit = error. */
async function runSteamCmd(
  exe: string,
  args: string[],
  onLog: (msg: string) => void,
  deps: DownloadWorkshopDeps | undefined,
  what: string
): Promise<void> {
  const output: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = (deps?.spawnImpl ?? spawn)(exe, args);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (message: string) => {
      clearTimeout(timer);
      reject(new Error(`${message}\n${output.slice(-10).join("\n")}`.trim()));
    };
    timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      fail(`SteamCMD timed out after ${STEAMCMD_TIMEOUT_MS / 60000} minutes ${what}.`);
    }, STEAMCMD_TIMEOUT_MS);

    child.stdout?.on("data", (d: Buffer) => {
      const lines = String(d).split(/\r?\n/).filter(Boolean);
      output.push(...lines);
      for (const line of lines) onLog(line);
    });
    child.stderr?.on("data", (d: Buffer) => output.push(String(d)));
    child.on("error", (err) => fail(`Could not run SteamCMD: ${err.message}`));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else fail(`SteamCMD exited with code ${code} ${what}.`);
    });
  });
}

export interface DerivedZomboidMod {
  modId: string;
  name: string | null;
}

function parseModInfo(content: string): { id: string | null; name: string | null } {
  let id: string | null = null;
  let name: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === "id" && value && id === null) id = value;
    else if (key === "name" && value && name === null) name = value;
  }
  return { id, name };
}

/**
 * Derive every mod ID carried by a downloaded workshop item: one per
 * `mod.info` found (max depth 6), `id=` line first, folder-name fallback.
 * Throws when the item contains no mod.info at all — it is not a PZ mod.
 */
export function deriveZomboidModIds(contentDir: string): DerivedZomboidMod[] {
  const found = new Map<string, DerivedZomboidMod>();
  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.toLowerCase() === "mod.info") {
        let content = "";
        try { content = fs.readFileSync(full, "utf-8"); } catch { continue; }
        const fallbackId = path.basename(path.dirname(full));
        const parsed = parseModInfo(content);
        const modId = parsed.id || fallbackId;
        if (!found.has(modId)) {
          found.set(modId, { modId, name: parsed.name });
        }
      }
    }
  };
  walk(contentDir, 0);

  if (found.size === 0) {
    throw new Error("The downloaded Workshop item contains no mod.info — it is not a Project Zomboid mod.");
  }
  return Array.from(found.values());
}
