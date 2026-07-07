import { Rcon } from "rcon-client";
import { prisma } from "./db";

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
      select: { rconPort: true, rconPassword: true, game: true }
    });

    if (!server || !server.rconPort || !server.rconPassword) {
      return null;
    }

    try {
      const rcon = await Rcon.connect({
        host: "127.0.0.1",
        port: server.rconPort,
        password: server.rconPassword,
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
}

export const rconManager = new RconManager();
