import fs from "fs";
import path from "path";
import { dataRoot } from "./appPaths";
import AdmZip from "adm-zip";
import { stampUntimestampedLines } from "./consoleFormat";

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

    fs.appendFileSync(file, stampUntimestampedLines(message.replace(/\r?\n$/, "")) + "\n");
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

// Read only the tail of the log file — the file rotates at 50MB and this runs
// on every console GET and inside crash handling, so a full read would block
// the event loop on a sync 50MB read.
const TAIL_BYTES = 1024 * 1024;

export function getServerLogTail(serverId: string, lines = 150): string {
  const file = serverLogFile(serverId);
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    return "No logs available. Start the server to generate logs.";
  }
  const windowBytes = Math.min(size, TAIL_BYTES);
  let text = "";
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(windowBytes);
      const bytesRead = fs.readSync(fd, buf, 0, windowBytes, size - windowBytes);
      text = buf.subarray(0, bytesRead).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "No logs available. Start the server to generate logs.";
  }
  const allLines = text.split("\n");
  // Mid-file start: the first line is partial — drop it.
  if (windowBytes < size) allLines.shift();
  // Drop trailing empty string produced by a file that ends with "\n"
  const trimmed = allLines.at(-1) === "" ? allLines.slice(0, -1) : allLines;
  return trimmed.slice(-lines).join("\n") + "\n";
}

// Rotated archives written by rotateLogFile: server-log-<ISO-timestamp>.zip,
// each holding the pre-rotation server.log.
const ARCHIVE_NAME_RE = /^server-log-[\w-]+\.zip$/;

export interface LogArchiveMeta {
  name: string;
  sizeBytes: number;
  createdAt: string; // ISO — file mtime, which is the rotation moment
}

/** List a server's rotated log archives, newest first. */
export function listLogArchives(serverId: string): LogArchiveMeta[] {
  const dir = path.dirname(serverLogFile(serverId));
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => ARCHIVE_NAME_RE.test(f))
    .map((name) => {
      try {
        const stats = fs.statSync(path.join(dir, name));
        return { name, sizeBytes: stats.size, createdAt: stats.mtime.toISOString() };
      } catch {
        return null; // deleted between readdir and stat (30-day cleanup race)
      }
    })
    .filter((a): a is LogArchiveMeta => a !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const MAX_ARCHIVE_CHARS = 2 * 1024 * 1024;

/**
 * Read the log text inside one rotated archive. Oversized archives keep their
 * most recent tail (`truncated: true`) — this feeds a viewer, not an export.
 */
export function readLogArchive(serverId: string, archiveName: string): { content: string; truncated: boolean } {
  if (!ARCHIVE_NAME_RE.test(archiveName)) {
    throw new Error("Invalid log archive name");
  }
  const zipPath = path.join(path.dirname(serverLogFile(serverId)), archiveName);
  if (!fs.existsSync(zipPath)) {
    throw new Error("Log archive not found");
  }
  const zip = new AdmZip(zipPath);
  const entry =
    zip.getEntries().find((e) => !e.isDirectory && e.entryName === "server.log") ??
    zip.getEntries().find((e) => !e.isDirectory);
  if (!entry) {
    throw new Error("Log archive is empty");
  }
  const text = zip.readAsText(entry);
  if (text.length > MAX_ARCHIVE_CHARS) {
    return { content: text.slice(-MAX_ARCHIVE_CHARS), truncated: true };
  }
  return { content: text, truncated: false };
}
