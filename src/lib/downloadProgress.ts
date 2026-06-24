export interface ProgressState {
  phase: string;          // e.g. "steam", "download", "extract", "script"
  percent: number | null; // 0..100, or null = indeterminate
  label: string;          // human label, e.g. "Downloading Valheim 42%"
  updatedAt: number;      // epoch ms
}

// globalThis-backed so the store survives Next.js dev hot-reloads (same pattern as
// localProcesses in localRunner.ts).
const globalForProgress = globalThis as unknown as {
  downloadProgress: Map<string, ProgressState> | undefined;
};

if (!globalForProgress.downloadProgress) {
  globalForProgress.downloadProgress = new Map();
}

const store = globalForProgress.downloadProgress;

export function setProgress(serverId: string, partial: Partial<ProgressState>): void {
  const existing = store.get(serverId) ?? { phase: "", percent: null, label: "", updatedAt: 0 };
  store.set(serverId, {
    phase: partial.phase ?? existing.phase,
    // Use `!== undefined` so an explicit null (indeterminate) is honored.
    percent: partial.percent !== undefined ? partial.percent : existing.percent,
    label: partial.label ?? existing.label,
    updatedAt: Date.now(),
  });
}

export function getProgress(serverId: string): ProgressState | null {
  return store.get(serverId) ?? null;
}

export function clearProgress(serverId: string): void {
  store.delete(serverId);
}

// Extracts the latest *download* percentage from SteamCMD stdout, e.g.
// "Update state (0x61) downloading, progress: 42.66 (123 / 456)" -> 42.66
//
// SteamCMD buffers stdout heavily on Windows, so a single chunk can carry the
// entire download history at once. We scan for every "downloading, progress: N"
// entry and return the LAST one, so the bar reflects current progress rather
// than the oldest value in the batch. Non-download phases (preallocating,
// verifying/validate) are deliberately ignored — returning null leaves the bar
// on its prior value instead of resetting or mislabeling them as "Downloading".
export function parseSteamProgress(line: string): number | null {
  const re = /downloading[,\s]*progress:\s*(\d+(?:\.\d+)?)/gi;
  let last: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const val = parseFloat(m[1]);
    if (Number.isFinite(val)) {
      last = Math.max(0, Math.min(100, val));
    }
  }
  return last;
}

// A freshly bootstrapped SteamCMD has an empty app-metadata cache, so the very
// first `app_update` for an app can fail with "Missing configuration" (exit code
// 8) even with `+app_info_update 1`. The identical command succeeds once the
// cache is warm, so this specific failure is safe to retry. Returns true when a
// SteamCMD result looks like that cold-cache failure.
export function isMissingConfigError(code: number | null, detail: string): boolean {
  if (code === 8) return true;
  return /Missing configuration/i.test(detail || "");
}

// Returns received/total as a 0..100 percent, or null when total is unknown/invalid.
export function computePercent(received: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(received) || received < 0) return null;
  return Math.max(0, Math.min(100, (received / total) * 100));
}
