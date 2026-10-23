/**
 * Pure log-line presentation helpers shared by the live console, the archive
 * viewer and the server-side log writer. Client-safe: no fs imports.
 */

export type LogLevel = "error" | "warn" | "info";

// Word-boundary patterns so "errorLevel" or "0 warnings" don't misclassify
// adjacent identifiers; the shapes cover game output and RealmSwap manager
// lines alike.
const ERROR_RE = /\b(?:errors?|fatal|severe|exceptions?|failed|failures?|crash(?:ed|es|ing)?)\b/i;
const WARN_RE = /\b(?:warn(?:ing|ings|s|ed)?|deprecated|retrying|timed out|auto-restart(?:ing)?)\b/i;

/** Classify a console line for coloring. Unknown lines are "info". */
export function classifyLogLevel(line: string): LogLevel {
  if (ERROR_RE.test(line)) return "error";
  if (WARN_RE.test(line)) return "warn";
  return "info";
}

// Leading timestamp shapes emitted by games and this app: `[12:34:56]`
// (Minecraft), bare `12:34:56`, ISO `2026-10-23T…`, `[2026-10-23 12:34:56]`,
// and ARK's `2026.10.23-…` log prefix.
const TIMESTAMPED_LINE_RE = /^\[?(?:\d{1,2}:\d{2}:\d{2}|\d{4}[-/.]\d{2}[-/.]\d{2})/;

/** Whether a log line already starts with its own timestamp. */
export function looksTimestamped(line: string): boolean {
  return TIMESTAMPED_LINE_RE.test(line);
}

/**
 * Prefix `[HH:MM:SS]` (local time) to every line that doesn't already carry a
 * timestamp — game lines keep their native timestamps, manager-side lines
 * gain one. Blank lines pass through unstamped.
 */
export function stampUntimestampedLines(message: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
  return message
    .split("\n")
    .map((line) =>
      line.trim() === "" || looksTimestamped(line) ? line : `${stamp} ${line}`
    )
    .join("\n");
}

export interface LogSegment {
  text: string;
  match: boolean;
}

/**
 * Split a line into plain and matching segments around a (case-insensitive)
 * filter query, for highlight rendering. An empty query returns the whole
 * line as one plain segment.
 */
export function highlightSegments(line: string, query: string): LogSegment[] {
  const q = query.trim();
  if (!q) return [{ text: line, match: false }];

  const lowerLine = line.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const segments: LogSegment[] = [];
  let cursor = 0;
  for (;;) {
    const idx = lowerLine.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      segments.push({ text: line.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) segments.push({ text: line.slice(cursor, idx), match: false });
    segments.push({ text: line.slice(idx, idx + q.length), match: true });
    cursor = idx + q.length;
  }
  return segments;
}
