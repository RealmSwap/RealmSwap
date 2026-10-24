import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { parseSpec } from "@/lib/definitions/serialize";
import { queryGameServer } from "@/lib/serverQuery";
import {
  bucketPlayerHistory,
  bucketWeeklyHeatmap,
  busiestHour,
  WEEKLY_WINDOW_MS,
} from "@/lib/statusShare";

// GET: the dashboard's player story — live count for the running server,
// the 24h history and the 7-day weekly heatmap from the telemetry stamps.
// Viewer-level (sizes and counts only, no player identities).
// The live query shares the public page's 20s-per-server bound so sidebar
// polling can't hammer the game server.
const LIVE_QUERY_TTL_MS = 20_000;

const globalForPlayers = globalThis as unknown as {
  __playersQueryCache: Map<string, { at: number; current: number | null; maxPlayers: number | null; supported: boolean }> | undefined;
};

function queryCache(): Map<string, { at: number; current: number | null; maxPlayers: number | null; supported: boolean }> {
  if (!globalForPlayers.__playersQueryCache) globalForPlayers.__playersQueryCache = new Map();
  return globalForPlayers.__playersQueryCache;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions" }, { status: 403 });
    }
    const server = access.server;

    let current: number | null = null;
    let maxPlayers: number | null = null;
    let supported = true;

    if (server.status === "RUNNING") {
      const record = server.definitionId
        ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
        : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
      const spec = record ? parseSpec(record.spec) : null;
      if (!spec?.queryType) {
        supported = false;
      } else {
        const cache = queryCache();
        const cached = cache.get(server.id);
        if (cached && Date.now() - cached.at < LIVE_QUERY_TTL_MS) {
          current = cached.current;
          maxPlayers = cached.maxPlayers;
        } else {
          const result = await queryGameServer(server, spec);
          if (result.status === "online") {
            current = result.players;
            maxPlayers = result.maxplayers;
          }
          cache.set(server.id, { at: Date.now(), current, maxPlayers, supported: true });
        }
      }
    }

    // One 7-day stamp fetch feeds the 24h sparkline and the weekly heatmap.
    const rows = await prisma.serverTelemetry.findMany({
      where: {
        serverId: server.id,
        playerCount: { not: null },
        createdAt: { gte: new Date(Date.now() - WEEKLY_WINDOW_MS) },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, playerCount: true },
    });
    const stampRows = rows.map((r) => ({ createdAt: r.createdAt, playerCount: r.playerCount as number }));

    const now = new Date();
    const weekly = bucketWeeklyHeatmap(stampRows, now);
    return NextResponse.json({
      current,
      maxPlayers,
      supported,
      history: bucketPlayerHistory(stampRows, now),
      weekly,
      busiest: busiestHour(weekly),
    });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/players error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
