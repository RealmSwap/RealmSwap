import { execFile } from "child_process";

/**
 * Process-tree stats for local Windows servers, without `wmic`.
 *
 * pidusage/pidtree both shell out to `wmic`, which Microsoft removed on
 * Windows 11 24H2+ — on current Windows every stats call failed and the
 * monitor flipped healthy servers to DEGRADED. This module queries
 * Win32_Process through PowerShell (present on every Windows install),
 * caches the snapshot briefly so N servers share one query per tick, walks
 * the process tree locally, and derives CPU% from 100-ns kernel+user time
 * deltas between samples (same semantics pidusage had: 100% = one full
 * core, can exceed 100 on multi-core trees).
 */

export interface ProcessRow {
  pid: number;
  ppid: number;
  workingSetBytes: number;
  cpuTimeSec: number; // kernel + user time, seconds
}

interface Snapshot {
  at: number;
  byPid: Map<number, ProcessRow>;
  children: Map<number, number[]>; // parent pid -> child pids
}

const SNAPSHOT_TTL_MS = 4000;
const QUERY_TIMEOUT_MS = 8000;

const globalForStats = globalThis as unknown as {
  winProcSnapshot: Snapshot | undefined;
  winProcInflight: Promise<Snapshot> | undefined;
};

const globalForCpu = globalThis as unknown as {
  winProcPrevCpu: Map<string, { at: number; perPid: Map<number, number> }> | undefined;
};
if (!globalForCpu.winProcPrevCpu) globalForCpu.winProcPrevCpu = new Map();
const prevCpu = globalForCpu.winProcPrevCpu;

const QUERY =
  "Get-CimInstance Win32_Process | " +
  "ForEach-Object { '{0},{1},{2},{3},{4}' -f $_.ProcessId,$_.ParentProcessId,$_.WorkingSetSize,$_.KernelModeTime,$_.UserModeTime }";

/** Parse the one-line-per-process output of the snapshot query. */
export function parseProcessLines(text: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(",");
    if (parts.length < 5) continue;
    const pid = Number(parts[0]);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    rows.push({
      pid,
      ppid: Number(parts[1]) || 0,
      workingSetBytes: Number(parts[2]) || 0,
      // 100-ns filetime ticks -> seconds
      cpuTimeSec: ((Number(parts[3]) || 0) + (Number(parts[4]) || 0)) / 1e7,
    });
  }
  return rows;
}

function indexRows(rows: ProcessRow[], at: number): Snapshot {
  const byPid = new Map<number, ProcessRow>();
  const children = new Map<number, number[]>();
  for (const row of rows) {
    byPid.set(row.pid, row);
    const siblings = children.get(row.ppid);
    if (siblings) siblings.push(row.pid);
    else children.set(row.ppid, [row.pid]);
  }
  return { at, byPid, children };
}

function runQuery(): Promise<Snapshot> {
  const inflight = globalForStats.winProcInflight;
  if (inflight) return inflight;

  const promise = new Promise<Snapshot>((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", QUERY],
      { timeout: QUERY_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        globalForStats.winProcInflight = undefined;
        if (err) {
          reject(new Error(`Process snapshot failed: ${err.message}`));
          return;
        }
        const snapshot = indexRows(parseProcessLines(stdout), Date.now());
        globalForStats.winProcSnapshot = snapshot;
        resolve(snapshot);
      }
    );
  });
  globalForStats.winProcInflight = promise;
  return promise;
}

/** Recent process snapshot, refreshing the shared cache when stale. */
export async function readProcessSnapshot(): Promise<Snapshot> {
  const cached = globalForStats.winProcSnapshot;
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached;
  return runQuery();
}

export function isPidAliveInSnapshot(snapshot: Snapshot, pid: number): boolean {
  return snapshot.byPid.has(pid);
}

/** Synchronous liveness check against the cached snapshot (no query). */
export function isPidAliveCached(pid: number): boolean {
  const cached = globalForStats.winProcSnapshot;
  return !!cached && cached.byPid.has(pid);
}

function collectTree(snapshot: Snapshot, rootPid: number): ProcessRow[] {
  if (!snapshot.byPid.has(rootPid)) {
    throw new Error(`No matching pid found: ${rootPid}`);
  }
  const tree: ProcessRow[] = [];
  const queue = [rootPid];
  const seen = new Set<number>(queue);
  while (queue.length > 0) {
    const pid = queue.shift()!;
    const row = snapshot.byPid.get(pid);
    if (row) tree.push(row);
    for (const child of snapshot.children.get(pid) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return tree;
}

/**
 * CPU% + memory for a whole process tree, keyed by server so each server's
 * CPU delta is computed against its own previous sample.
 */
export async function getTreeStats(
  serverKey: string,
  rootPid: number
): Promise<{ cpuPercent: number; memoryMB: number }> {
  const snapshot = await readProcessSnapshot();
  const tree = collectTree(snapshot, rootPid);

  let memoryBytes = 0;
  let cpuSec = 0;
  const perPid = new Map<number, number>();
  for (const row of tree) {
    memoryBytes += row.workingSetBytes;
    perPid.set(row.pid, row.cpuTimeSec);
    cpuSec += row.cpuTimeSec;
  }

  // CPU% from the delta against this server's previous sample. Children that
  // weren't in the previous sample contribute 0 their first tick (same warm-up
  // pidusage had) so a freshly spawned child can't spike the number.
  let cpuPercent = 0;
  const prev = prevCpu.get(serverKey);
  const now = snapshot.at;
  if (prev) {
    const elapsedSec = (now - prev.at) / 1000;
    if (elapsedSec > 0.25) {
      let delta = 0;
      perPid.forEach((cpu, pid) => {
        const before = prev.perPid.get(pid);
        if (before !== undefined && cpu > before) delta += cpu - before;
      });
      cpuPercent = Math.max(0, (100 * delta) / elapsedSec);
    }
  }
  prevCpu.set(serverKey, { at: now, perPid });

  return {
    cpuPercent: parseFloat(cpuPercent.toFixed(1)),
    memoryMB: parseFloat((memoryBytes / (1024 * 1024)).toFixed(1)),
  };
}

export function forgetTreeStats(serverKey: string): void {
  prevCpu.delete(serverKey);
}

/** Test hook: seed the shared snapshot cache directly, bypassing the query. */
export function setProcessSnapshotForTests(rows: ProcessRow[], atMs: number): void {
  globalForStats.winProcSnapshot = indexRows(rows, atMs);
}

/** tasklist fallback for callers that can't afford/await a snapshot. */
export function isPidAliveTasklist(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) resolve(false);
        else resolve(!stdout.toLowerCase().includes("info:"));
      }
    );
  });
}
