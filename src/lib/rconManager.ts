import { Rcon } from "rcon-client";
import { prisma } from "./db";
import { resolveGameHost } from "./gameHost";
import { queryGameServer, playerNamesFromQuery } from "./serverQuery";
import { parseSpec } from "./definitions/serialize";

class RconManager {
  private connections: Map<string, Rcon> = new Map();

  async getConnection(serverId: string): Promise<Rcon | null> {
    if (this.connections.has(serverId)) {
      const conn = this.connections.get(serverId)!;
      if (conn.authenticated) return conn;
      // If it exists but disconnected, clean it up
      this.connections.delete(serverId);
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { rconPort: true, rconPassword: true, game: true, id: true, runnerType: true, nodeId: true }
    });

    if (!server || !server.rconPort || !server.rconPassword) {
      return null;
    }

    try {
      const rcon = await Rcon.connect({
        host: await resolveGameHost(server),
        port: server.rconPort,
        password: server.rconPassword,
        // Default 2000ms rejects `save-all flush` on large Minecraft worlds
        // mid-write, which reads as a failed backup flush.
        timeout: 10000,
      });

      rcon.on("error", (err) => {
        console.error(`RCON Error [${serverId}]:`, err);
        this.connections.delete(serverId);
      });

      rcon.on("end", () => {
        this.connections.delete(serverId);
      });

      this.connections.set(serverId, rcon);
      return rcon;
    } catch (err) {
      console.error(`Failed to connect RCON [${serverId}]:`, err);
      return null;
    }
  }

  async execute(serverId: string, command: string): Promise<string | null> {
    const rcon = await this.getConnection(serverId);
    if (!rcon) return null;

    try {
      const response = await rcon.send(command);
      return response;
    } catch (err) {
      console.error(`RCON Exec Error [${serverId}]:`, err);
      return null;
    }
  }

  async getPlayers(serverId: string, game: string): Promise<string[]> {
    const rcon = await this.getConnection(serverId);
    if (!rcon) return [];

    try {
      let response = "";
      if (game.toUpperCase() === "MINECRAFT") {
        response = await rcon.send("list");
        // Example output: "There are 1 of a max of 20 players online: Notch"
        const parts = response.split(":");
        if (parts.length > 1) {
          const playersStr = parts[1].trim();
          if (playersStr) {
            return playersStr.split(", ").map(p => p.trim());
          }
        }
      } else if (game.toUpperCase() === "PALWORLD") {
        response = await rcon.send("ShowPlayers");
        // Output format:
        // name,playeruid,steamid
        // Player1,234234,7656...
        const lines = response.split("\n").map(l => l.trim()).filter(l => l);
        if (lines.length > 1) {
          return lines.slice(1).map(l => {
            const cols = l.split(",");
            return cols[0]; // Player name
          });
        }
      } else {
        // Generic fallback if we don't know the exact format
        // Just return the raw response as a single element, or try to parse
      }

      return [];
    } catch (err) {
      console.error(`RCON Players Error [${serverId}]:`, err);
      return [];
    }
  }

  /**
   * Live roster for the Players page: RCON first (names + admin actions work),
   * falling back to the shared gamedig query when RCON isn't configured (or
   * doesn't answer) so "live player counts" work for every game that speaks a
   * query protocol, not just RCON-configured ones.
   */
  async getLivePlayers(server: {
    id: string;
    game: string;
    status: string;
    definitionId?: string | null;
    port: number;
    name: string;
    ramAllocation: number;
    password?: string | null;
    paramValues?: string | null;
    runnerType?: string | null;
    nodeId?: string | null;
  }): Promise<{ players: string[]; source: "rcon" | "query" | null }> {
    if (server.status !== "RUNNING") return { players: [], source: null };

    const viaRcon = await this.getPlayers(server.id, server.game);
    if (viaRcon.length > 0) return { players: viaRcon, source: "rcon" };

    const record = server.definitionId
      ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
      : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
    const spec = record ? parseSpec(record.spec) : null;
    if (!spec?.queryType) return { players: [], source: null };

    const result = await queryGameServer(server, spec, { host: await resolveGameHost(server) });
    return { players: playerNamesFromQuery(result), source: result.status === "online" ? "query" : null };
  }
}

export const rconManager = new RconManager();
