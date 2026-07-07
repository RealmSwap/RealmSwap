import fs from "fs";
import path from "path";
import { dataRoot } from "./appPaths";
import AdmZip from "adm-zip";

function rotateLogFile(serverId: string, filePath: string) {
  try {
    const dir = path.dirname(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const zipPath = path.join(dir, `server-log-${timestamp}.zip`);
    
    const zip = new AdmZip();
    zip.addLocalFile(filePath);
    zip.writeZip(zipPath);
    
    fs.writeFileSync(filePath, ""); // truncate
    cleanOldArchives(dir);
  } catch (err) {
    console.error("Log rotation failed:", err);
  }
}

function cleanOldArchives(dir: string) {
  try {
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    
    for (const file of files) {
      if (file.startsWith("server-log-") && file.endsWith(".zip")) {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > THIRTY_DAYS_MS) {
          fs.rmSync(fullPath, { force: true });
        }
      }
    }
  } catch (err) {
    console.error("Archive cleanup failed:", err);
  }
}

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

    // Rotate if over 50MB
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      if (stats.size > 50 * 1024 * 1024) {
        rotateLogFile(serverId, file);
      }
    }

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
