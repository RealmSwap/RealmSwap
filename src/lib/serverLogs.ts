import fs from "fs";
import path from "path";
import { dataRoot } from "./appPaths";

// Console output is appended to <dataRoot>/local-servers/<serverId>/server.log and
// streamed to the UI by the log-tailing SSE route. Persisting to disk means console
// history survives app restarts and is shared by every runner implementation.
export function serverLogFile(serverId: string): string {
  return path.join(dataRoot(), "local-servers", serverId, "server.log");
}

export function appendLog(serverId: string, message: string): void {
  try {
    const file = serverLogFile(serverId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, message.replace(/\r?\n$/, "") + "\n");
  } catch {
    // best-effort logging; never let a log write crash the runner
  }
}

export function clearLogs(serverId: string): void {
  try {
    fs.rmSync(serverLogFile(serverId), { force: true });
  } catch {
    // ignore
  }
}

export function getServerLogTail(serverId: string, lines = 150): string {
  const file = serverLogFile(serverId);
  if (!fs.existsSync(file)) {
    return "No logs available. Start the server to generate logs.";
  }
  const content = fs.readFileSync(file, "utf-8");
  const allLines = content.split("\n");
  // Drop trailing empty string produced by a file that ends with "\n"
  const trimmed = allLines.at(-1) === "" ? allLines.slice(0, -1) : allLines;
  return trimmed.slice(-lines).join("\n") + "\n";
}
