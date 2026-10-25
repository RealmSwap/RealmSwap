/**
 * Resource-aware node scheduling — RECOMMEND-ONLY by design: home users hate
 * surprises, so RealmSwap never auto-places a server. The create form uses
 * this to badge the best-fit node (and pre-select it, which the user can
 * override), and to say exactly WHY a node is not eligible.
 *
 * Scoring inputs are what agent heartbeats already report (total RAM, free
 * disk) plus what the dashboard knows (RAM assigned to servers it manages on
 * that node). Actual used RAM from other workloads on the node is invisible
 * to us — "available" here means "not promised to RealmSwap servers".
 */

export interface SchedulingNode {
  id: string;
  name: string;
  online: boolean;
  totalRamMB: number | null;
  freeDiskGB: number | null;
  assignedRamGB: number;
  runningServers: number;
}

export interface SchedulingRequirements {
  /** The server's RAM allocation (GB). */
  requiredRamGB: number;
  /** The game's install size (GB); worlds grow, so a 20% margin is added. */
  requiredDiskGB?: number;
}

export interface NodeVerdict {
  eligible: boolean;
  /** Always present for ineligible nodes so the UI can say why. */
  reason?: string;
  /** Lower is better; only meaningful among eligible nodes. */
  score?: number;
  ramAvailableGB?: number | null;
}

export const DISK_MARGIN = 1.2;

export function evaluateNode(
  node: SchedulingNode,
  req: SchedulingRequirements
): NodeVerdict {
  if (!node.online) {
    return { eligible: false, reason: "offline" };
  }
  if (node.totalRamMB == null) {
    // No heartbeat data yet — eligible but scored last; the node may simply
    // have just enrolled.
    return { eligible: true, score: Number.MAX_SAFE_INTEGER, ramAvailableGB: null };
  }
  const ramAvailableGB = Math.max(0, (node.totalRamMB - node.assignedRamGB * 1024) / 1024);
  if (ramAvailableGB < req.requiredRamGB) {
    return {
      eligible: false,
      reason: `needs ${req.requiredRamGB}GB RAM, has ${ramAvailableGB.toFixed(1)}GB unassigned`,
      ramAvailableGB,
    };
  }
  const diskNeeded = req.requiredDiskGB ? req.requiredDiskGB * DISK_MARGIN : null;
  if (diskNeeded != null && node.freeDiskGB != null && node.freeDiskGB < diskNeeded) {
    return {
      eligible: false,
      reason: `needs ~${diskNeeded.toFixed(0)}GB free disk, has ${node.freeDiskGB}GB`,
      ramAvailableGB,
    };
  }
  // Score (lower is better): most ABSOLUTE unassigned RAM wins — on home
  // fleets a 64GB box with 52GB free beats an idle 16GB box for a world that
  // will grow — then fewer servers already assigned as the tiebreak.
  const score = -ramAvailableGB + node.runningServers * 0.5;
  return { eligible: true, score, ramAvailableGB };
}

export interface NodeRecommendation {
  node: SchedulingNode;
  ramAvailableGB: number | null;
  /** Human-readable why, e.g. "Lowest utilization · 12GB RAM free · 1 server running". */
  reason: string;
}

/**
 * The best eligible node, or null when nothing fits (callers should surface
 * the per-node reasons rather than silently falling back).
 */
export function recommendNode(
  nodes: SchedulingNode[],
  req: SchedulingRequirements
): NodeRecommendation | null {
  let best: { node: SchedulingNode; score: number; ramAvailableGB: number } | null = null;
  for (const node of nodes) {
    const verdict = evaluateNode(node, req);
    if (!verdict.eligible) continue;
    if (!best || verdict.score! < best.score) {
      best = { node, score: verdict.score!, ramAvailableGB: verdict.ramAvailableGB! };
    }
  }
  if (!best) return null;
  const ramText =
    best.ramAvailableGB == null || Number.isNaN(best.ramAvailableGB)
      ? null
      : `${best.ramAvailableGB.toFixed(0)}GB RAM free`;
  const parts = ["Lowest utilization", ramText, `${best.node.runningServers} server${best.node.runningServers === 1 ? "" : "s"} running`].filter(Boolean);
  return { node: best.node, ramAvailableGB: best.ramAvailableGB, reason: parts.join(" · ") };
}
