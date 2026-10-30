import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "child_process";
import {
  parseProcessLines,
  getTreeStats,
  setProcessSnapshotForTests,
} from "../runners/winProcessStats";

// One server tree: pid 100 (root) with child 200; pid 300 belongs to someone
// else. CPU times are 100-ns filetime ticks, as Win32_Process reports them.
const SNAPSHOT_1 = [
  "100,4,100000000,50000000,50000000", // root: 10s cpu, ~95MB ws
  "200,100,50000000,25000000,25000000", // child: 5s cpu
  "300,42,1000,1000,1000",
  "garbage,line,here",
  ",,,,",
].join("\r\n");

const SNAPSHOT_2 = SNAPSHOT_1.replace(
  "50000000,50000000", // root kernel+user time: 10s total ...
  "90000000,90000000" // ... -> 18s total; child unchanged
);

describe("parseProcessLines", () => {
  it("parses CSV rows and skips garbage", () => {
    const rows = parseProcessLines(SNAPSHOT_1);
    expect(rows).toHaveLength(3);
    const root = rows.find((r) => r.pid === 100)!;
    expect(root.ppid).toBe(4);
    expect(root.workingSetBytes).toBe(100000000);
    expect(root.cpuTimeSec).toBeCloseTo(10, 5);
  });

  it("computes cpu seconds from kernel+user ticks", () => {
    const child = parseProcessLines(SNAPSHOT_1).find((r) => r.pid === 200)!;
    expect(child.cpuTimeSec).toBeCloseTo(5, 5);
  });
});

describe("getTreeStats", () => {
  beforeEach(() => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("sums the whole tree's memory and starts CPU at 0 before a baseline exists", async () => {
    setProcessSnapshotForTests(parseProcessLines(SNAPSHOT_1), Date.now());
    const stats = await getTreeStats("srv-a", 100);
    expect(stats.memoryMB).toBeCloseTo(150000000 / (1024 * 1024), 1);
    expect(stats.cpuPercent).toBe(0);
  });

  it("derives CPU% from the delta between samples", async () => {
    setProcessSnapshotForTests(parseProcessLines(SNAPSHOT_1), Date.now());
    await getTreeStats("srv-b", 100);
    // Second sample 5 virtual seconds later — root gained 8s CPU over that
    // window (10s -> 18s) -> 160% of one core; child unchanged.
    setProcessSnapshotForTests(parseProcessLines(SNAPSHOT_2), Date.now() + 5000);
    const stats = await getTreeStats("srv-b", 100);
    expect(stats.cpuPercent).toBeCloseTo(160, 0);
  });

  it("excludes unrelated processes from the tree", async () => {
    setProcessSnapshotForTests(parseProcessLines(SNAPSHOT_1), Date.now());
    const stats = await getTreeStats("srv-c", 100);
    // Tree = root (100MB) + child (50MB); pid 300's bytes must not count.
    expect(stats.memoryMB).toBeCloseTo(150000000 / (1024 * 1024), 1);
  });

  it("throws the legacy 'No matching pid found' error for dead roots", async () => {
    setProcessSnapshotForTests(parseProcessLines(SNAPSHOT_1), Date.now());
    await expect(getTreeStats("srv-d", 999)).rejects.toThrow(/No matching pid found/);
  });
});
