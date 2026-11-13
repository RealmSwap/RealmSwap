import { GameDig } from "gamedig";
import type { GameDefinitionSpec } from "./definitions/types";
import { renderTemplate } from "./definitions/template";
import { gameHost } from "./appPaths";

/**
 * Shared game-server query (gamedig) used by the authenticated
 * /api/servers/[id]/query route and the public status page — one honest
 * code path for "how many players are actually on".
 */

export interface GameQueryContext {
  name: string;
  nameSanitized: string;
  password: string;
  port: number;
  ram: number;
  [key: string]: string | number | boolean;
}

export function buildQueryContext(server: {
  name: string;
  port: number;
  ramAllocation: number;
  password?: string | null;
  paramValues?: string | null;
}): GameQueryContext {
  const paramValues = typeof server.paramValues === "string" ? JSON.parse(server.paramValues) : {};
  return {
    name: server.name,
    nameSanitized: server.name.replace(/[^a-zA-Z0-9]/g, "_"),
    password: server.password || "",
    port: server.port,
    ram: server.ramAllocation,
    ...paramValues,
  };
}

export function resolveQueryPort(spec: GameDefinitionSpec, ctx: GameQueryContext, fallbackPort: number): number {
  if (!spec.queryPort) return fallbackPort;
  let rendered: string;
  try {
    rendered = renderTemplate(spec.queryPort, ctx).trim();
  } catch {
    // An unresolvable template (unknown {var}) must not crash the caller —
    // fall back to the join port like a spec without a queryPort would.
    return fallbackPort;
  }
  // "{port}+1" style offsets: several Steam games (Valheim, V Rising) run their
  // query listener one port above the join port the server row stores.
  const m = /^(\d{1,5})(?:\+(\d{1,5}))?$/.exec(rendered);
  if (!m) return fallbackPort;
  return Number(m[1]) + (m[2] ? Number(m[2]) : 0);
}

export type GameQueryResult =
  | { status: "online"; name: string; players: number; maxplayers: number; playerList: unknown[] }
  | { status: "unsupported"; error: string }
  | { status: "offline"; error: string };

export async function queryGameServer(
  server: { status: string; port: number; name: string; ramAllocation: number; password?: string | null; paramValues?: string | null },
  spec: GameDefinitionSpec,
  deps: {
    dig?: (opts: { type: string; host: string; port: number }) => Promise<any>;
    host?: string;
  } = {}
): Promise<GameQueryResult> {
  if (server.status !== "RUNNING") {
    return { status: "offline", error: "Server is not running" };
  }
  if (!spec.queryType) {
    return { status: "unsupported", error: "Query protocol not supported for this game" };
  }

  const ctx = buildQueryContext(server);
  const queryPort = resolveQueryPort(spec, ctx, server.port);

  try {
    const state = await (deps.dig ?? GameDig.query)({
      type: spec.queryType as string,
      host: deps.host ?? gameHost(),
      port: queryPort,
    });
    return {
      status: "online",
      name: state.name,
      players: state.players.length,
      maxplayers: state.maxplayers,
      playerList: state.players,
    };
  } catch (e: any) {
    return { status: "offline", error: e?.message || "Query failed" };
  }
}

/**
 * Live-roster names from a gamedig result. Some protocols return unnamed
 * players (null/empty name entries) — those are dropped rather than shown
 * as blank roster cards.
 */
export function playerNamesFromQuery(result: GameQueryResult): string[] {
  if (result.status !== "online") return [];
  return result.playerList
    .map((p) => (p as { name?: unknown } | null)?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
}
