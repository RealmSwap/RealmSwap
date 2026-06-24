import { EventEmitter } from "events";

export const serverLogs = new Map<string, string[]>();
export const logEmitter = new EventEmitter();
// Increase the max listeners to avoid memory leak warnings if many clients connect
logEmitter.setMaxListeners(100);

export function appendLog(serverId: string, message: string) {
  if (!serverLogs.has(serverId)) {
    serverLogs.set(serverId, []);
  }
  const logs = serverLogs.get(serverId)!;
  
  // Split message by newline to handle chunks properly
  const lines = message.split(/\r?\n/);
  for (let line of lines) {
    if (line.trim().length === 0 && lines.length > 1) continue;
    logs.push(line);
    logEmitter.emit(`log:${serverId}`, line);
  }

  // Keep last 1000 lines
  if (logs.length > 1000) {
    logs.splice(0, logs.length - 1000);
  }
}

export function clearLogs(serverId: string) {
  serverLogs.delete(serverId);
}
