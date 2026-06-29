import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { EventEmitter } from "events";
import * as tar from "tar";
import crypto from "crypto";

// Global in-memory task map
const tasks = new Map<string, SyncTask>();

export class SyncTask extends EventEmitter {
  id: string;
  host: string;
  inviteCode: string;
  manifest: any;
  customGamePath: string;
  
  status: string = "Initializing...";
  percent: number = 0;
  isDone: boolean = false;
  error: string | null = null;
  
  constructor(host: string, inviteCode: string, manifest: any, customGamePath: string) {
    super();
    this.id = crypto.randomBytes(8).toString("hex");
    this.host = host;
    this.inviteCode = inviteCode;
    this.manifest = manifest;
    this.customGamePath = customGamePath;
    
    tasks.set(this.id, this);
    
    // Start async execution
    this.run().catch(err => {
      this.error = err.message;
      this.emit("update");
    });
  }

  updateProgress(status: string, percent: number) {
    this.status = status;
    this.percent = percent;
    this.emit("update");
  }

  async run() {
    this.updateProgress("Locating game installation...", 5);
    
    // 1. Determine Game Directory
    let gameDir = this.customGamePath;
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
        await this.downloadThunderstoreMod(mod.packageId, mod.version, pluginsDir);
      }
      
      completedMods++;
    }

    this.updateProgress("Syncing server configurations...", 70);
    
    // 3. Download and Extract Configs from Host
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

  async downloadThunderstoreMod(packageId: string, version: string, extractPath: string) {
    // Actually downloading from thunderstore API is complex (finding the download URL).
    // For this MVP, we will simulate downloading the mod to avoid real network hits to Thunderstore.
    // In a real app we would hit https://thunderstore.io/api/experimental/package/${namespace}/${name}/
    return new Promise(resolve => setTimeout(resolve, 500));
  }

  async downloadAndExtractConfigs(gameDir: string) {
    const configUrl = `http://${this.host}/api/sync/${this.inviteCode}/configs`;
    const res = await fetch(configUrl);
    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error("Failed to fetch configs from host: " + errTxt);
    }
    
    if (!res.body) throw new Error("No body in config response");
    
    // Stream response directly into tar extractor
    return new Promise<void>(async (resolve, reject) => {
      const { PassThrough } = require("stream");
      const pt = new PassThrough();
      
      // Node 18+ Web Streams to Node Stream interop
      // @ts-ignore
      const reader = res.body.getReader();
      
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              pt.end();
              break;
            }
            pt.write(value);
          }
        } catch(e) {
          reject(e);
        }
      };
      
      pump();
      
      pt.pipe(tar.x({ cwd: gameDir }))
        .on("finish", () => resolve())
        .on("error", (e: any) => reject(e));
    });
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

export function getTask(id: string) {
  return tasks.get(id);
}
