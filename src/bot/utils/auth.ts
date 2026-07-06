import { ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../../lib/db";

export async function findAuthorizedServer(
  interaction: ChatInputCommandInteraction,
  gameQuery: string | undefined
) {
  if (!gameQuery) return { error: "No query provided." };

  const discordId = interaction.user.id;
  
  let discordRoleIds: string[] = [];
  if (interaction.member && "roles" in interaction.member) {
    const roles: any = interaction.member.roles;
    if (Array.isArray(roles)) {
      discordRoleIds = roles; // API interaction
    } else if (roles && typeof roles === "object" && "cache" in roles) {
      discordRoleIds = Array.from(roles.cache.keys()); // Discord.js manager
    }
  }

  const user = await prisma.user.findUnique({
    where: { discordId }
  });

  // We do NOT instantly fail if `!user` anymore, because they might be authorized via a Discord Role!

  const servers = await prisma.server.findMany({
    where: {
      AND: [
        { OR: [{ game: { equals: gameQuery.toLowerCase() } }, { name: { contains: gameQuery.toLowerCase() } }] },
        { 
          OR: [
            { userId: user?.id || "unmatched" }, 
            { collaborators: { some: { userId: user?.id || "unmatched" } } },
            { discordRoles: { some: { roleId: { in: discordRoleIds } } } }
          ] 
        }
      ]
    }
  });

  if (servers.length === 0) {
    if (!user && discordRoleIds.length === 0) {
      return { error: "You don't have permission to use this command. Type `/link` to connect your GameVault account!" };
    }
    return { error: `Could not find any server matching \`${gameQuery}\` that you have access to.` };
  }

  return { server: servers[0], user };
}
