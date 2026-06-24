import { Server, GameDefinition } from "@/generated/client";

export interface ProcessStats {
  cpuPercent: number;
  memoryMB: number;
}

export interface ServerRunner {
  /**
   * Initialize or update the server installation (e.g. download binaries, run SteamCMD, docker pull).
   */
  install(server: Server, definition: GameDefinition | null, onProgress: (pct: number | null, label: string) => void, onLog: (msg: string) => void): Promise<void>;

  /**
   * Start the server process. Returns once the server is successfully launched (and optionally ready).
   */
  start(server: Server, definition: GameDefinition | null): Promise<void>;

  /**
   * Gracefully stop the server process.
   */
  stop(server: Server): Promise<void>;

  /**
   * Update the server binaries (e.g. SteamCMD update, docker pull latest).
   */
  update(server: Server, definition: GameDefinition | null): Promise<void>;

  /**
   * Send a command to the server's console (stdin).
   */
  sendCommand(server: Server, command: string): Promise<void>;

  /**
   * Retrieve current live resource usage stats.
   */
  getStats(server: Server): Promise<ProcessStats>;

  /**
   * Retrieve the console logs of the server.
   */
  getLogs(server: Server): Promise<string>;
}
