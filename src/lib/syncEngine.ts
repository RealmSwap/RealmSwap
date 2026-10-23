import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { EventEmitter } from "events";
import * as tar from "tar";
import AdmZip from "adm-zip";
import crypto from "crypto";
import {
  RealmSyncManifest,
  authHeader,
  verifyBodySignature,
} from "@/lib/realmsync";
import {
  ThunderstorePackage,
  ThunderstoreVersion,
  communityForGame,
  fetchCommunityIndex,
  findVersionEntry,
  newestVersion,
  isBepInExCore,
  extractThunderstorePackage,
} from "@/lib/mods/thunderstore";

// Global in-memory task map that persists across Next.js reloads/chunks
const globalForTasks = globalThis as unknown as { tasks: Map<string, SyncTask> };
if (!globalForTasks.tasks) {
  globalForTasks.tasks = new Map<string, SyncTask>();
}
const tasks = globalForTasks.tasks;

const TASK_TTL_MS = 10 * 60 * 1000; // finished tasks linger for progress polling, then go
const MAX_TASKS = 100;
const MOD_DOWNLOAD_TIMEOUT_MS = 120_000;
const CONFIGS_DOWNLOAD_TIMEOUT_MS = 300_000;

export interface SyncTaskOptions {
  host: string;
  codeId: string;
  secret: string;
  manifest: RealmSyncManifest;
  customGamePath: string;
  userId: string;
}

export class SyncTask extends EventEmitter {
  id: string;
  host: string;
  codeId: string;
  secret: string;
  manifest: RealmSyncManifest;
  customGamePath: string;
  userId: string;

  status: string = "Initializing...";
  percent: number = 0;
  isDone: boolean = false;
  error: string | null = null;

  constructor(opts: SyncTaskOptions) {
    super();
    this.id = crypto.randomBytes(8).toString("hex");
    this.host = opts.host;
    this.codeId = opts.codeId;
    this.secret = opts.secret;
    this.manifest = opts.manifest;
    this.customGamePath = opts.customGamePath;
    this.userId = opts.userId;

    tasks.set(this.id, this);
    pruneFinishedTasks();

    // Start async execution
    this.run().catch(err => {
      this.error = err.message;
      this.emit("update");
    }).finally(() => this.scheduleCleanup());
  }

  updateProgress(status: string, percent: number) {
    this.status = status;
    this.percent = percent;
    this.emit("update");
  }

  private scheduleCleanup() {
    const timer = setTimeout(() => tasks.delete(this.id), TASK_TTL_MS);
    timer.unref?.();
  }

  async run() {
    this.updateProgress("Locating game installation...", 5);

    // 1. Determine Game Directory
    let gameDir: string | null = this.customGamePath || null;
    if (!gameDir) {
      gameDir = this.autoDetectGameDir(this.manifest.game);
      if (!gameDir) {
        throw new Error("Could not automatically locate the game. Please provide the custom path.");
      }
    }

    if (!fs.existsSync(gameDir)) {
      throw new Error(`Game directory does not exist: ${gameDir}`);
    }

    this.updateProgress("Found game. Preparing download...", 10);

    // 2. Download and Extract Mods from Thunderstore
    const mods = this.manifest.mods || [];
    let completedMods = 0;

    // BepInEx plugin dir
    const pluginsDir = path.join(gameDir, "BepInEx", "plugins");
    fs.mkdirSync(pluginsDir, { recursive: true });

    for (const mod of mods) {
      this.updateProgress(`Downloading mod: ${mod.name || mod.packageId}...`, 10 + (completedMods / mods.length) * 50);

      if (mod.provider === "thunderstore") {
        await this.downloadThunderstoreMod(mod.packageId, mod.version, gameDir, pluginsDir);
      }

      completedMods++;
    }

    this.updateProgress("Syncing server configurations...", 70);

    // 3. Download and Extract Configs from Host (integrity-verified before anything touches the game dir)
    await this.downloadAndExtractConfigs(gameDir);

    this.updateProgress("Launching game...", 95);

    // 4. Launch Game
    await this.launchGame(this.manifest.game);

    this.isDone = true;
    this.updateProgress("Done", 100);
  }

  autoDetectGameDir(gameName: string): string | null {
    // A simplified Steam game locator for Windows
    // Normally we'd read libraryfolders.vdf, but for this MVP, we check the default path
    let folderName = gameName;
    if (gameName.toLowerCase() === "valheim") folderName = "Valheim";
    if (gameName.toLowerCase() === "lethal company") folderName = "Lethal Company";

    const defaultPath = path.join("C:\\Program Files (x86)\\Steam\\steamapps\\common", folderName);
    if (fs.existsSync(defaultPath)) return defaultPath;

    // Check D drive fallback
    const dPath = path.join("D:\\SteamLibrary\\steamapps\\common", folderName);
    if (fs.existsSync(dPath)) return dPath;

    return null;
  }

  async downloadThunderstoreMod(packageId: string, version: string, gameDir: string, pluginsDir: string) {
    const community = communityForGame(this.manifest.game);
    if (!community) {
      throw new Error(`Mods for ${this.manifest.game} cannot be auto-downloaded yet.`);
    }

    const index = await fetchCommunityIndex(community);
    const pkg: ThunderstorePackage | undefined = index.find(p => p.full_name === packageId);
    if (!pkg) {
      throw new Error(`Mod "${packageId}" is no longer available on Thunderstore.`);
    }

    // Fall back to newest when the pinned version is "unknown" or has been delisted
    const entry: ThunderstoreVersion | null =
      (version && version !== "unknown" ? findVersionEntry(pkg, { versionNumber: version }) : null) ??
      newestVersion(pkg);
    if (!entry || !entry.download_url) {
      throw new Error(`Mod "${packageId}" has no downloadable version on Thunderstore.`);
    }

    const res = await fetch(entry.download_url, { signal: AbortSignal.timeout(MOD_DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`Thunderstore download failed for "${packageId}" (HTTP ${res.status}).`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);

    // BepInEx core packs extract to the game root; content mods live under plugins/<packageId>
    const destDir = isBepInExCore(packageId) ? gameDir : path.join(pluginsDir, packageId);
    fs.mkdirSync(destDir, { recursive: true });
    extractThunderstorePackage(zip, destDir);
  }

  async downloadAndExtractConfigs(gameDir: string) {
    const pathname = `/sync/${this.codeId}/configs`;
    const configUrl = `http://${this.host}${pathname}`;
    const res = await fetch(configUrl, {
      headers: { Authorization: authHeader(this.secret, "GET", pathname) },
      signal: AbortSignal.timeout(CONFIGS_DOWNLOAD_TIMEOUT_MS),
    });

    if (res.status === 204) {
      // Server returned 204 No Content because there are no configs (e.g. Vanilla)
      return;
    }

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      throw new Error("Failed to fetch configs from host " +
        `(HTTP ${res.status}${errTxt ? `: ${errTxt.substring(0, 200)}` : ""}).`);
    }

    const body = Buffer.from(await res.arrayBuffer());

    // Verify the host's HMAC signature over the exact bytes BEFORE extracting —
    // a tampered or truncated transfer must never reach the game directory.
    if (!verifyBodySignature(this.secret, body, res.headers.get("x-realmsync-signature"))) {
      throw new Error("The config bundle failed integrity verification — the transfer may have been tampered with. Nothing was extracted.");
    }

    if (body.length === 0) {
      return;
    }

    // Stage the extraction so an interrupted/corrupt archive never leaves
    // half-written files behind; only verified, fully-extracted trees move in.
    const staging = path.join(gameDir, `.realmsync-staging-${Date.now()}`);
    fs.mkdirSync(staging, { recursive: true });
    try {
      const tmpArchive = path.join(os.tmpdir(), `realmsync-${Date.now()}.tar.gz`);
      try {
        fs.writeFileSync(tmpArchive, body);
        await tar.x({ file: tmpArchive, cwd: staging });
      } finally {
        fs.rmSync(tmpArchive, { force: true });
      }

      for (const entry of fs.readdirSync(staging)) {
        fs.cpSync(path.join(staging, entry), path.join(gameDir, entry), { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }

  async launchGame(gameName: string) {
    let appId = "892970"; // Valheim default
    if (gameName.toLowerCase() === "lethal company") appId = "1966720";

    return new Promise<void>((resolve) => {
      // Use Windows cmd start to invoke steam:// URL
      exec(`start steam://run/${appId}`, (err) => {
        resolve(); // Ignore errors, user might have game on Xbox
      });
    });
  }
}

function pruneFinishedTasks() {
  if (tasks.size <= MAX_TASKS) return;
  const finished = Array.from(tasks.entries())
    .filter(([, t]) => t.isDone || t.error)
    .sort((a, b) => a[1].percent - b[1].percent);
  while (tasks.size > MAX_TASKS && finished.length) {
    const [id] = finished.shift()!;
    tasks.delete(id);
  }
}

/** Return the still-running task for the same invite + game path, if any. */
export function findActiveSyncTask(host: string, codeId: string, customGamePath: string): SyncTask | null {
  for (const task of Array.from(tasks.values())) {
    if (!task.isDone && !task.error && task.host === host && task.codeId === codeId && task.customGamePath === customGamePath) {
      return task;
    }
  }
  return null;
}

export function getTask(id: string) {
  return tasks.get(id);
}
