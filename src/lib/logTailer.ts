import fs from "fs";
import path from "path";
import { dataRoot } from "./appPaths";

export const LOG_PLACEHOLDER = "No logs yet. Waiting for server output…";

export interface TailOptions {
  signal: AbortSignal;
  tailLines?: number;
  pollIntervalMs?: number;
}

export function serverLogPath(serverId: string): string {
  return path.join(dataRoot(), "local-servers", serverId, "server.log");
}

function statSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function readRange(filePath: string, start: number, end: number): string {
  const length = end - start;
  if (length <= 0) return "";
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buf, 0, length, start);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Tail a file: yield the last `tailLines` lines as a snapshot, then yield
 * arrays of newly-appended complete lines. Poll-based for Windows reliability.
 */
export async function* tailFile(
  filePath: string,
  opts: TailOptions
): AsyncGenerator<string[]> {
  const tailLines = opts.tailLines ?? 200;
  const pollIntervalMs = opts.pollIntervalMs ?? 500;
  const { signal } = opts;

  let offset = 0;
  let leftover = "";

  // Initial snapshot
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    yield lines.slice(-tailLines);
    offset = Buffer.byteLength(content, "utf8");
  } else {
    yield [LOG_PLACEHOLDER];
    offset = 0;
  }

  // Tail loop
  while (!signal.aborted) {
    await delay(pollIntervalMs, signal);
    if (signal.aborted) break;

    const size = statSize(filePath);
    if (size < offset) {
      // truncated / rotated — start over
      offset = 0;
      leftover = "";
    }
    if (size > offset) {
      const chunk = readRange(filePath, offset, size);
      offset = size;
      const text = leftover + chunk;
      const parts = text.split("\n");
      leftover = parts.pop() ?? "";
      if (parts.length > 0) yield parts;
    }
  }
}

export function streamServerLog(
  serverId: string,
  opts: TailOptions
): AsyncGenerator<string[]> {
  return tailFile(serverLogPath(serverId), opts);
}
