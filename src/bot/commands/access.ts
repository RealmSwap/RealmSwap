import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../lib/db";

export default {
  data: new SlashCommandBuilder()
    .setName("access")
    .setDescription("Manage Discord Role access to GameVault servers")
    .addSubcommand(subcommand =>
      subcommand.setName("grant")
        .setDescription("Grant a Discord Role access to manage a GameVault server")
        .addRoleOption(option => option.setName("role").setDescription("The Discord Role to grant access to").setRequired(true))
        .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand.setName("revoke")
        .setDescription("Revoke a Discord Role's access to a GameVault server")
        .addRoleOption(option => option.setName("role").setDescription("The Discord Role to revoke access from").setRequired(true))
        .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const role = interaction.options.getRole("role", true);
    const gameQuery = interaction.options.getString("game", true).toLowerCase();

    // 1. Verify the user running this command has GameVault permissions
    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id }
    });

    if (!user) {
      return interaction.reply({ content: `You must link your GameVault account to use this command. Type \`/link\`.`, ephemeral: true });
    }

    // 2. Find the server, but ensure the user is the OWNER
    const servers = await prisma.server.findMany({
      where: {
        AND: [
          { OR: [{ game: { equals: gameQuery } }, { name: { contains: gameQuery } }] },
          { userId: user.id } // ONLY the owner can grant access!
        ]
      }
    });

    if (servers.length === 0) {
      return interaction.reply({ content: `Could not find any server matching \`${gameQuery}\` that you own. Only the Server Owner can manage Role access.`, ephemeral: true });
    }

    const server = servers[0];

    if (subcommand === "grant") {
      try {
        await prisma.discordRoleAccess.upsert({
          where: {
            serverId_roleId: {
              serverId: server.id,
              roleId: role.id
            }
          },
          update: {},
          create: {
            serverId: server.id,
            roleId: role.id
          }
        });
        
        return interaction.reply({ content: `✅ The **${role.name}** role now has access to manage **${server.name}**!`, ephemeral: false });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: `Failed to grant access.`, ephemeral: true });
      }
    }

    if (subcommand === "revoke") {
      try {
        await prisma.discordRoleAccess.deleteMany({
          where: {
            serverId: server.id,
            roleId: role.id
          }
        });
        
        return interaction.reply({ content: `❌ The **${role.name}** role no longer has access to manage **${server.name}**.`, ephemeral: false });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: `Failed to revoke access.`, ephemeral: true });
      }
    }
  },
};
