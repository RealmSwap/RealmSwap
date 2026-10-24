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

export interface PublicServerStatus {
  code: string;
  name: string;
  game: string;
  status: string; // raw: RUNNING / STOPPED / CRASHED / …
  players: number | null; // null = running but the game doesn't answer queries
  maxplayers: number | null;
  nextSession: (PlannedSessionSummary & { isNext: true }) | null;
}

const STATUS_CACHE_TTL_MS = 20_000;

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
  const status: PublicServerStatus = {
    code,
    name: server.name,
    game: server.game,
    status: server.status,
    players,
    maxplayers,
    nextSession: next ? { ...next, isNext: true } : null,
  };

  statusCache().set(code, { status, at: now.getTime() });
  return status;
}
