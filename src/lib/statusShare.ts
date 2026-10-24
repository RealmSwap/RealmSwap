import { parseSpec } from "./definitions/serialize";
import { prisma as defaultPrisma } from "./db";
import { queryGameServer } from "./serverQuery";
import { summarizePlannedSession, PlannedSessionSummary } from "./sessions";
import type { PrismaClient } from "@/generated/client";

/**
 * The public, no-login status page (`/s/<code>`): is the server up, how many
 * players are on, and when is the next planned session. Deliberately
 * leak-proof — the response carries the server name, game, up/down state,
 * player COUNTS and next-session info only. Never the address, password,
 * host identity, or player names.
 */

export interface PlayerHistoryPoint {
  t: string; // ISO start of a 30-minute bucket
  n: number; // peak player count within the bucket
}

export interface PublicServerStatus {
  code: string;
  name: string;
  game: string;
  status: string; // raw: RUNNING / STOPPED / CRASHED / …
  players: number | null; // null = running but the game doesn't answer queries
  maxplayers: number | null;
  nextSession: (PlannedSessionSummary & { isNext: true }) | null;
  history: PlayerHistoryPoint[]; // player counts over the last 24h (counts only — no names, no timestamps of individual joins)
  weekly: number[][]; // 7×24 avg players per weekday-hour over the last week (host-local time) — the "Fridays 8–11 PM" story
}

const STATUS_CACHE_TTL_MS = 20_000;

export const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const HISTORY_BUCKET_MS = 30 * 60 * 1000;

/**
 * Bucket 5-minute player stamps into 30-minute buckets over the last 24h,
 * keeping each bucket's peak. Only buckets that actually have samples are
 * returned — "no data yet" (the feature just shipped, server stopped) must
 * not render as a wall of fake zeros.
 */
export function bucketPlayerHistory(
  rows: { createdAt: Date | string; playerCount: number }[],
  now: Date
): PlayerHistoryPoint[] {
  const start = now.getTime() - HISTORY_WINDOW_MS;
  const buckets = new Map<number, number>();
  for (const row of rows) {
    const ts = new Date(row.createdAt).getTime();
    if (ts < start || ts > now.getTime()) continue;
    const idx = Math.floor((ts - start) / HISTORY_BUCKET_MS);
    const current = buckets.get(idx);
    if (current === undefined || row.playerCount > current) buckets.set(idx, row.playerCount);
  }
  return Array.from(buckets.keys())
    .sort((a, b) => a - b)
    .map((idx) => ({
      t: new Date(start + idx * HISTORY_BUCKET_MS).toISOString(),
      n: buckets.get(idx)!,
    }));
}

export const WEEKLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "Fridays 8–11 PM" as data: average player count per weekday×hour over the
 * last 7 days, bucketed in the HOST's local time (that's the timezone the
 * sessions actually happen in). grid[getDay()][getHours()]. Stamps only
 * exist while the server runs, so quiet hours read as 0 without claiming
 * the server was offline.
 */
export function bucketWeeklyHeatmap(
  rows: { createdAt: Date | string; playerCount: number }[],
  now: Date
): number[][] {
  const start = now.getTime() - WEEKLY_WINDOW_MS;
  const sums = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const row of rows) {
    const ts = new Date(row.createdAt).getTime();
    if (ts < start || ts > now.getTime()) continue;
    const d = new Date(ts); // host-local wall clock — the timezone sessions happen in
    sums[d.getDay()][d.getHours()] += row.playerCount;
    counts[d.getDay()][d.getHours()] += 1;
  }
  return sums.map((daySums, dow) =>
    daySums.map((sum, hour) =>
      counts[dow][hour] > 0 ? Math.round((sum / counts[dow][hour]) * 10) / 10 : 0
    )
  );
}

export interface BusiestHour {
  dow: number; // 0 = Sunday (Date#getDay)
  hour: number; // 0–23, host-local
  avg: number; // average players in that hour over the week
}

/** The single busiest weekday-hour cell; null when the week has no player data at all. */
export function busiestHour(grid: number[][]): BusiestHour | null {
  let best: BusiestHour | null = null;
  for (let dow = 0; dow < grid.length; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const avg = grid[dow][hour];
      if (avg > 0 && (!best || avg > best.avg)) best = { dow, hour, avg };
    }
  }
  return best;
}

const globalForStatus = globalThis as unknown as {
  statusShareCache: Map<string, { status: PublicServerStatus; at: number }> | undefined;
};

function statusCache(): Map<string, { status: PublicServerStatus; at: number }> {
  if (!globalForStatus.statusShareCache) globalForStatus.statusShareCache = new Map();
  return globalForStatus.statusShareCache;
}

/** Test seam — the TTL cache would otherwise bleed between tests. */
export function clearStatusCache(): void {
  statusCache().clear();
}

// Same pick the dashboard makes: earliest session that hasn't started yet.
// Double-guarded against clock drift (the DB query already filters on
// startTime > now) because a session that fired seconds ago should not be
// advertised as "next".
export function nextSessionFrom(
  rows: { id: string; title: string; startTime: Date | string; roster: string }[],
  now: Date
): PlannedSessionSummary | null {
  const upcoming = rows
    .map(summarizePlannedSession)
    .filter((s) => new Date(s.startTime).getTime() > now.getTime())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return upcoming[0] ?? null;
}

export async function getPublicStatus(
  code: string,
  deps: { prisma?: PrismaClient; dig?: (opts: { type: string; host: string; port: number }) => Promise<any>; now?: Date } = {}
): Promise<PublicServerStatus | null> {
  const prisma = deps.prisma ?? defaultPrisma;
  const now = deps.now ?? new Date();

  const cached = statusCache().get(code);
  if (cached && now.getTime() - cached.at < STATUS_CACHE_TTL_MS) return cached.status;

  const server = await prisma.server.findUnique({
    where: { statusShareCode: code },
    include: {
      plannedSessions: {
        where: { startTime: { gt: now } },
        orderBy: { startTime: "asc" },
        take: 3,
      },
    },
  });
  if (!server) return null;

  let players: number | null = null;
  let maxplayers: number | null = null;
  if (server.status === "RUNNING") {
    const def = server.definitionId
      ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
      : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
    if (def) {
      const result = await queryGameServer(server, parseSpec(def.spec), { dig: deps.dig });
      if (result.status === "online") {
        players = result.players;
        maxplayers = result.maxplayers;
      }
    }
  }

  const next = nextSessionFrom(server.plannedSessions ?? [], now);

  // Player history from the telemetry table's 5-minute stamps — counts only,
  // so the public payload stays leak-proof (no player names, no join events).
  // One 7-day fetch feeds both the 24h strip and the weekly heatmap.
  const historyRows = await prisma.serverTelemetry
    .findMany({
      where: {
        serverId: server.id,
        playerCount: { not: null },
        createdAt: { gte: new Date(now.getTime() - WEEKLY_WINDOW_MS) },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, playerCount: true },
    })
    .catch(() => [] as { createdAt: Date; playerCount: number | null }[]);

  const stampRows = historyRows.map((r) => ({ createdAt: r.createdAt, playerCount: r.playerCount as number }));

  const status: PublicServerStatus = {
    code,
    name: server.name,
    game: server.game,
    status: server.status,
    players,
    maxplayers,
    nextSession: next ? { ...next, isNext: true } : null,
    history: bucketPlayerHistory(stampRows, now),
    weekly: bucketWeeklyHeatmap(stampRows, now),
  };

  statusCache().set(code, { status, at: now.getTime() });
  return status;
}
