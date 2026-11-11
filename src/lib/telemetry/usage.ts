import { prisma } from "@/lib/db";
import packageInfo from "../../../package.json";

/**
 * The once-a-day, strictly derived usage summary. Every field comes from a
 * coarse question about the local database — never names, addresses,
 * passwords, or player numbers. `explainSnapshot` is the user-facing
 * translation of the same data, shown in Settings before anyone opts in.
 */

const BUILT_IN_SLUGS = new Set([
  "MINECRAFT", "VALHEIM", "ENSHROUDED", "ZOMBOID", "ARK", "TERRARIA",
  "PALWORLD", "RUST", "SATISFACTORY", "VRISING", "WINDROSE",
]);

export interface UsageSnapshot {
  day: string;
  appVersion: string | null;
  platform: string;
  servers: number;
  games: string[];
  deployed: boolean;
  first_online: boolean;
  mods: boolean;
  invite: boolean;
  friend_joined: boolean;
  status_share: boolean;
  session_planned: boolean;
  remote_host: boolean;
  active: boolean;
}

const FIELD_EXPLANATIONS: Record<string, string> = {
  day: "The UTC day this summary covers.",
  appVersion: "Your RealmSwap version.",
  platform: "Your operating system.",
  servers: "How many servers exist (capped at 99).",
  games: "Which games they are — built-in game slugs only; anything custom counts as \"custom\".",
  deployed: "Whether at least one server exists.",
  first_online: "Whether any server has ever successfully booted.",
  mods: "Whether any mods or modpacks are installed.",
  invite: "Whether an invite link has been minted.",
  friend_joined: "Whether any server has ever reported someone playing.",
  status_share: "Whether a public status page has been shared.",
  session_planned: "Whether a Discord game night has been planned.",
  remote_host: "Whether a second machine is enrolled as a remote host.",
  active: "Whether any server ran during the covered day.",
};

export function explainSnapshot(snapshot: UsageSnapshot): Array<{ field: string; value: unknown; meaning: string }> {
  return Object.entries(snapshot)
    .filter(([field]) => FIELD_EXPLANATIONS[field])
    .map(([field, value]) => ({ field, value, meaning: FIELD_EXPLANATIONS[field] }));
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function computeUsageSnapshot(now: Date = new Date()): Promise<UsageSnapshot> {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const servers = await prisma.server.findMany({
    select: {
      game: true, status: true, firstOnlineAt: true, inviteCode: true, statusShareCode: true, runnerType: true,
      mods: { select: { id: true }, take: 1 },
    },
  });

  const games = new Set<string>();
  for (const server of servers.slice(0, 99)) {
    games.add(BUILT_IN_SLUGS.has(server.game.toUpperCase()) ? server.game.toUpperCase() : "custom");
  }

  const friendJoined = await prisma.serverTelemetry.findFirst({
    where: { playerCount: { gt: 0 } },
    select: { id: true },
  });
  const sessionPlanned = await prisma.plannedSession.findFirst({ select: { id: true } });
  const ranToday = await prisma.serverTelemetry.findFirst({
    where: { createdAt: { gte: startOfToday } },
    select: { id: true },
  });

  return {
    day: utcDay(now),
    appVersion: process.env.npm_package_version ?? packageInfo.version,
    platform: process.platform,
    servers: Math.min(servers.length, 99),
    games: Array.from(games).slice(0, 12),
    deployed: servers.length > 0,
    first_online: servers.some((s) => s.firstOnlineAt != null),
    mods: servers.some((s) => s.mods.length > 0),
    invite: servers.some((s) => s.inviteCode != null),
    friend_joined: friendJoined != null,
    status_share: servers.some((s) => s.statusShareCode != null),
    session_planned: sessionPlanned != null,
    remote_host: servers.some((s) => s.runnerType === "AGENT"),
    active: servers.some((s) => s.status === "RUNNING" || s.status === "STARTING") || ranToday != null,
  };
}
