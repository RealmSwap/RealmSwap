/**
 * Merge-preserving config writes.
 *
 * Definition templates only manage a subset of a config file's keys, but the
 * runners rewrite template config files on every start. A blind overwrite
 * destroys every other key in the file (and every hand edit made through the
 * raw config editor). These helpers merge the rendered template into the
 * existing file instead:
 *
 * - JSON files are deep-merged (rendered values win on conflicts).
 * - key=value formats (.properties/.ini/.cfg) get a line-based merge: existing
 *   lines (including comments and unrecognized lines) are preserved verbatim;
 *   lines whose key appears in the rendered template have only their value
 *   replaced; keys that exist only in the template are appended at the end.
 *
 * Known limitation: in sectioned .ini files, brand-new keys are appended at the
 * end of the file, which places them in the last section's scope. Managed
 * definitions should declare any sectioned key in their template so the merge
 * only ever *updates* existing lines in place.
 */

const KEY_VALUE_LINE_RE = /^(\s*)([A-Za-z0-9_.\-[\]]+?)(\s*[=:]\s*)(.*)$/;

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t === "" || t.startsWith("#") || t.startsWith(";");
}

/** Parse "key=value" style content into an ordered list of [key, value] pairs. */
function parseKeyValuePairs(content: string): [string, string][] {
  const pairs: [string, string][] = [];
  for (const line of content.split(/\r?\n/)) {
    if (isCommentLine(line)) continue;
    const m = KEY_VALUE_LINE_RE.exec(line);
    if (m) pairs.push([m[2], m[4]]);
  }
  return pairs;
}

export function mergeKeyValueContent(existing: string, rendered: string): string {
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const existingLines = existing.split(/\r?\n/);
  // Map each managed key to the first existing line that defines it.
  const lineIndexOf = new Map<string, number>();
  existingLines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    const m = KEY_VALUE_LINE_RE.exec(line);
    if (m && !lineIndexOf.has(m[2])) lineIndexOf.set(m[2], i);
  });

  const appended: string[] = [];
  for (const [key, value] of parseKeyValuePairs(rendered)) {
    const idx = lineIndexOf.get(key);
    if (idx !== undefined) {
      // Preserve the original line's indentation, key spelling, and separator.
      existingLines[idx] = existingLines[idx].replace(
        KEY_VALUE_LINE_RE,
        (_m, indent: string, k: string, sep: string) => `${indent}${k}${sep}${value}`
      );
    } else {
      appended.push(`${key}=${value}`);
    }
  }

  let lines = existingLines;
  // Drop a trailing empty element so appended keys land at true end-of-file.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines = lines.slice(0, -1);
  if (appended.length > 0) lines = [...lines, ...appended];
  return lines.join(eol) + eol;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep merge: source values win; nested plain objects merge recursively; arrays are replaced wholesale. */
function deepMerge(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) return source;
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(source)) {
    out[k] = deepMerge(out[k], v);
  }
  return out;
}

export function mergeJsonContent(existing: string, rendered: string): string | null {
  let ex: unknown;
  let ren: unknown;
  try {
    ex = JSON.parse(existing);
    ren = JSON.parse(rendered);
  } catch {
    return null; // not mergeable JSON — caller should fall back to a full write
  }
  return JSON.stringify(deepMerge(ex, ren), null, 2) + "\n";
}

/**
 * Merge a rendered template into existing file content, sniffing the format.
 * Returns the rendered content unchanged when the existing content is empty
 * (first boot) or not mergeable.
 */
export function mergeConfigContent(existing: string, rendered: string): string {
  if (!existing.trim()) return rendered;
  const asJson = mergeJsonContent(existing, rendered);
  if (asJson !== null) return asJson;
  return mergeKeyValueContent(existing, rendered);
}
