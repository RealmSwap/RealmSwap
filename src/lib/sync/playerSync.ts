import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { BUILTIN_DEFINITIONS } from "@/lib/definitions/builtins";
import { dataRoot } from "@/lib/appPaths";

export async function syncServerPlayers(serverId: string) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: {
      playerAccess: {
        include: { player: true }
      }
    }
  });

  if (!server) throw new Error("Server not found");
  if (server.runnerType !== "LOCAL" || !server.localPath) {
    console.log(`[PlayerSync] Skipping sync for non-local server ${serverId}`);
    return;
  }

  const globallyBannedPlayers = await prisma.player.findMany({
    where: {
      userId: server.userId,
      isGloballyBanned: true
    }
  });

  const gameDef = BUILTIN_DEFINITIONS.find(d => d.slug === server.game);
  if (!gameDef) throw new Error(`Game definition ${server.game} not found`);

  const syncSpec = gameDef.spec.playerSync;
  if (!syncSpec || syncSpec.strategy === "none") {
    console.log(`[PlayerSync] Game ${server.game} does not support player sync.`);
    return;
  }

  const serverRoot = server.localPath;

  const bannedPlayers = new Map<string, any>();
  for (const p of globallyBannedPlayers) bannedPlayers.set(p.id, p);
  
  const whitelistedPlayers = [];
  const ops = [];

  for (const access of server.playerAccess) {
    if (access.isBanned && !bannedPlayers.has(access.playerId)) {
      bannedPlayers.set(access.playerId, access.player);
    }
    if (access.isWhitelisted) {
      whitelistedPlayers.push({ access, player: access.player });
    }
    if (access.serverRole === "ADMIN" || access.serverRole === "MODERATOR" || access.player.roles?.includes("ADMIN")) {
      ops.push({ access, player: access.player });
    }
  }

  try {
    if (syncSpec.strategy === "minecraft_json") {
      if (syncSpec.banlistPath) {
        const bans = Array.from(bannedPlayers.values())
          .filter(p => p.minecraftUuid)
          .map(p => ({
            uuid: p.minecraftUuid,
            name: p.name,
            created: new Date().toISOString(),
            source: "RealmSwap",
            expires: "forever",
            reason: p.globalBanReason || "Banned by RealmSwap"
          }));
        await fs.writeFile(path.join(serverRoot, syncSpec.banlistPath), JSON.stringify(bans, null, 2));
      }

      if (syncSpec.whitelistPath) {
        const whitelist = whitelistedPlayers
          .filter(p => p.player.minecraftUuid)
          .map(p => ({
            uuid: p.player.minecraftUuid,
            name: p.player.name
          }));
        await fs.writeFile(path.join(serverRoot, syncSpec.whitelistPath), JSON.stringify(whitelist, null, 2));
      }

      if (syncSpec.opsPath) {
        const opsList = ops
          .filter(p => p.player.minecraftUuid)
          .map(p => ({
            uuid: p.player.minecraftUuid,
            name: p.player.name,
            level: 4,
            bypassesPlayerLimit: true
          }));
        await fs.writeFile(path.join(serverRoot, syncSpec.opsPath), JSON.stringify(opsList, null, 2));
      }
    } else if (syncSpec.strategy === "valheim_txt") {
      const writeTxtList = async (relPath: string | undefined, players: any[]) => {
        if (!relPath) return;
        const ids = players.map(p => p.steamId).filter(id => id);
        if (ids.length > 0) {
          await fs.writeFile(path.join(serverRoot, relPath), ids.join("\n") + "\n");
        } else {
          await fs.writeFile(path.join(serverRoot, relPath), "");
        }
      };

      await writeTxtList(syncSpec.banlistPath, Array.from(bannedPlayers.values()));
      await writeTxtList(syncSpec.whitelistPath, whitelistedPlayers.map(p => p.player));
      await writeTxtList(syncSpec.opsPath, ops.map(p => p.player));
    }
    
    console.log(`[PlayerSync] Successfully synced players for server ${serverId}`);
  } catch (err: any) {
    console.error(`[PlayerSync] Failed to sync players for server ${serverId}: ${err.message}`);
  }
}
