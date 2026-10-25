import { describe, it, expect } from "vitest";
import { evaluateNode, recommendNode, type SchedulingNode } from "../scheduling";

// Recommend-only scheduling: the engine never places anything — it says who
// fits, who doesn't (and why), and which eligible node has the most headroom.

function node(overrides: Partial<SchedulingNode> = {}): SchedulingNode {
  return {
    id: "n1", name: "NAS", online: true, totalRamMB: 16384,
    freeDiskGB: 500, assignedRamGB: 0, runningServers: 0,
    ...overrides,
  };
}

describe("evaluateNode", () => {
  it("is eligible with a reason when the node is offline", () => {
    const v = evaluateNode(node({ online: false }), { requiredRamGB: 4 });
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe("offline");
  });

  it("refuses nodes without enough unassigned RAM, stating the numbers", () => {
    const v = evaluateNode(node({ assignedRamGB: 14 }), { requiredRamGB: 4 });
    expect(v.eligible).toBe(false);
    expect(v.reason).toContain("needs 4GB RAM");
    expect(v.reason).toContain("2.0GB unassigned");
  });

  it("applies a 20% disk margin for world growth", () => {
    const v = evaluateNode(node({ freeDiskGB: 23 }), { requiredRamGB: 2, requiredDiskGB: 20 });
    expect(v.eligible).toBe(false);
    expect(v.reason).toContain("24GB free disk");
    expect(evaluateNode(node({ freeDiskGB: 25 }), { requiredRamGB: 2, requiredDiskGB: 20 }).eligible).toBe(true);
  });

  it("skips the disk check when unknown (no requirement or no heartbeat yet)", () => {
    expect(evaluateNode(node({ freeDiskGB: null }), { requiredRamGB: 2, requiredDiskGB: 20 }).eligible).toBe(true);
    expect(evaluateNode(node(), { requiredRamGB: 2, requiredDiskGB: undefined }).eligible).toBe(true);
  });

  it("treats a node without heartbeat data as eligible but worst-scored", () => {
    const fresh = evaluateNode(node({ totalRamMB: null }), { requiredRamGB: 4 });
    expect(fresh.eligible).toBe(true);
    expect(fresh.score).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("scores absolute unassigned RAM, penalizing busy nodes", () => {
    // Most absolute headroom wins: 52GB free beats 16GB free.
    const big = evaluateNode(node({ id: "big", totalRamMB: 65536, assignedRamGB: 12 }), { requiredRamGB: 4 });
    const small = evaluateNode(node({ id: "small", totalRamMB: 16384, assignedRamGB: 0 }), { requiredRamGB: 4 });
    expect(big.score!).toBeLessThan(small.score!);
    // Same RAM free; the busier node scores worse.
    const idle = evaluateNode(node({ assignedRamGB: 4, runningServers: 0 }), { requiredRamGB: 4 });
    const busy = evaluateNode(node({ assignedRamGB: 4, runningServers: 3 }), { requiredRamGB: 4 });
    expect(idle.score!).toBeLessThan(busy.score!);
  });
});

describe("recommendNode", () => {
  it("picks the eligible node with the most absolute free RAM", () => {
    const rec = recommendNode([
      node({ id: "a", name: "Big Box", totalRamMB: 65536, assignedRamGB: 40 }),
      node({ id: "b", name: "NAS", totalRamMB: 16384, assignedRamGB: 0, runningServers: 1 }),
    ], { requiredRamGB: 8, requiredDiskGB: 20 });
    // 24GB unassigned beats 16GB unassigned, even though the NAS is idler.
    expect(rec?.node.id).toBe("a");
    expect(rec?.reason).toMatch(/^Lowest utilization · 24GB RAM free · 0 servers running$/);
  });

  it("never recommends an offline or overcommitted node", () => {
    const rec = recommendNode([
      node({ online: false }),
      node({ id: "n2", assignedRamGB: 15 }),
    ], { requiredRamGB: 8 });
    expect(rec).toBeNull();
  });

  it("returns null for an empty fleet rather than pretending", () => {
    expect(recommendNode([], { requiredRamGB: 4 })).toBeNull();
  });

  it("pluralizes the running-server count in the reason", () => {
    const rec = recommendNode([node({ runningServers: 2 })], { requiredRamGB: 2 });
    expect(rec?.reason).toContain("2 servers running");
  });
});
