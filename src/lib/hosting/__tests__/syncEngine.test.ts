import { describe, it, expect } from "vitest";
import { planTransfer, isIgnored, runTransfer } from "../syncEngine";
import { DEFAULT_IGNORE, FileEntry, Transferer, TransferPlan } from "../types";

const f = (relPath: string, size: number, mtimeMs: number): FileEntry => ({ relPath, size, mtimeMs, isDir: false });
const d = (relPath: string): FileEntry => ({ relPath, size: 0, mtimeMs: 0, isDir: true });

describe("isIgnored", () => {
  it("matches directory prefixes", () => {
    expect(isIgnored("logs/latest.log", DEFAULT_IGNORE)).toBe(true);
    expect(isIgnored("logs", DEFAULT_IGNORE)).toBe(true);
  });
  it("matches basename globs", () => {
    expect(isIgnored("world/session.lock", DEFAULT_IGNORE)).toBe(true);
  });
  it("matches exact filenames", () => {
    expect(isIgnored("realm.json", DEFAULT_IGNORE)).toBe(true);
  });
  it("does not match unrelated paths", () => {
    expect(isIgnored("world/level.dat", DEFAULT_IGNORE)).toBe(false);
  });
});

describe("planTransfer", () => {
  it("copies files missing on the destination", () => {
    const plan = planTransfer([f("world/level.dat", 10, 100)], [], []);
    expect(plan.ops).toContainEqual({ type: "copy", relPath: "world/level.dat" });
  });

  it("creates destination directories that are absent", () => {
    const plan = planTransfer([d("world"), f("world/level.dat", 10, 100)], [], []);
    const mkdirs = plan.ops.filter((o) => o.type === "mkdir").map((o) => o.relPath);
    expect(mkdirs).toContain("world");
    // mkdir ops sort before copies
    expect(plan.ops[0].type).toBe("mkdir");
  });

  it("skips files that are unchanged (same size, dest not older)", () => {
    const plan = planTransfer([f("a.txt", 5, 100)], [f("a.txt", 5, 100)], []);
    expect(plan.ops.find((o) => o.relPath === "a.txt")).toBeUndefined();
  });

  it("copies when size differs", () => {
    const plan = planTransfer([f("a.txt", 6, 100)], [f("a.txt", 5, 100)], []);
    expect(plan.ops).toContainEqual({ type: "copy", relPath: "a.txt" });
  });

  it("copies when source is newer than destination", () => {
    const plan = planTransfer([f("a.txt", 5, 200)], [f("a.txt", 5, 100)], []);
    expect(plan.ops).toContainEqual({ type: "copy", relPath: "a.txt" });
  });

  it("does not re-copy when destination is newer", () => {
    const plan = planTransfer([f("a.txt", 5, 100)], [f("a.txt", 5, 200)], []);
    expect(plan.ops.find((o) => o.relPath === "a.txt")).toBeUndefined();
  });

  it("excludes ignored paths from the plan", () => {
    const plan = planTransfer([f("logs/x.log", 5, 100), f("world/level.dat", 5, 100)], [], DEFAULT_IGNORE);
    const paths = plan.ops.map((o) => o.relPath);
    expect(paths).not.toContain("logs/x.log");
    expect(paths).toContain("world/level.dat");
  });
});

function fakeTransferer(failOn: string[] = []) {
  const calls: string[] = [];
  const t: Transferer = {
    async mkdir(rel) { calls.push("mkdir:" + rel); },
    async copy(rel) {
      calls.push("copy:" + rel);
      if (failOn.includes(rel)) throw new Error("boom");
    },
  };
  return { t, calls };
}

describe("runTransfer", () => {
  const plan: TransferPlan = {
    ops: [
      { type: "mkdir", relPath: "world" },
      { type: "copy", relPath: "world/level.dat" },
      { type: "copy", relPath: "server.properties" },
    ],
  };
  const sizes = new Map([["world/level.dat", 100], ["server.properties", 20]]);

  it("executes every op and tallies transferred files and bytes", async () => {
    const { t, calls } = fakeTransferer();
    const progress: Array<[number, number]> = [];
    const summary = await runTransfer(plan, t, sizes, (d, tot) => progress.push([d, tot]));
    expect(calls).toEqual(["mkdir:world", "copy:world/level.dat", "copy:server.properties"]);
    expect(summary.filesTransferred).toBe(2);
    expect(summary.bytesTransferred).toBe(120);
    expect(summary.failures).toEqual([]);
    expect(progress[progress.length - 1]).toEqual([3, 3]);
  });

  it("collects per-file failures without throwing", async () => {
    const { t } = fakeTransferer(["server.properties"]);
    const summary = await runTransfer(plan, t, sizes, () => {});
    expect(summary.filesTransferred).toBe(1);
    expect(summary.bytesTransferred).toBe(100);
    expect(summary.failures).toEqual([{ relPath: "server.properties", error: "boom" }]);
  });

  it("collects a failed mkdir without aborting later ops", async () => {
    const plan: TransferPlan = {
      ops: [
        { type: "mkdir", relPath: "world" },
        { type: "copy", relPath: "world/level.dat" },
      ],
    };
    const sizes = new Map([["world/level.dat", 50]]);
    const transferer: Transferer = {
      async mkdir(rel) {
        if (rel === "world") throw new Error("denied");
      },
      async copy() {},
    };
    const summary = await runTransfer(plan, transferer, sizes, () => {});
    expect(summary.failures).toEqual([{ relPath: "world", error: "denied" }]);
    expect(summary.filesTransferred).toBe(1);
    expect(summary.bytesTransferred).toBe(50);
  });

  it("onProgress receives a label for each op", async () => {
    const { t } = fakeTransferer();
    const labels: string[] = [];
    await runTransfer(plan, t, sizes, (done, total, label) => {
      if (label) labels.push(label);
    });
    expect(labels.length).toBeGreaterThan(0);
    expect(labels).toContain("world/level.dat");
    expect(labels.some((l) => l.includes("world"))).toBe(true);
  });
});
