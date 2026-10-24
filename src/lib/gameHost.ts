import { prisma } from "@/lib/db";
import { gameHost } from "@/lib/appPaths";

/**
 * Where the dashboard should reach a given server's published ports
 * (gamedig queries, RCON). Local/DOCKER servers answer on this machine's
 * loopback (or GAMEVAULT_GAME_HOST for a containerized dashboard); AGENT
 * servers answer on their node's LAN IP.
 */
export async function resolveGameHost(server: {
  id: string;
  runnerType?: string | null;
  nodeId?: string | null;
}): Promise<string> {
  if (server.runnerType === "AGENT" && server.nodeId) {
    const node = await prisma.agentNode.findUnique({
      where: { id: server.nodeId },
      select: { lanIp: true },
    }).catch(() => null);
    if (node?.lanIp) return node.lanIp;
  }
  return gameHost();
}
