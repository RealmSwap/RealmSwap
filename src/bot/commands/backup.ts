import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { prisma } from "../../lib/db";
import { createBackup } from "../../lib/backupService";

export default {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Manage server backups")
    .addSubcommand(subcommand =>
      subcommand
        .setName("create")
        .setDescription("Create a manual backup")
        .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("list")
        .setDescription("List recent backups")
        .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
    if (!user) return interaction.reply({ content: `You don't have permission.`, ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const gameQuery = interaction.options.getString("game")?.toLowerCase();

    const servers = await prisma.server.findMany({
      where: { OR: [{ game: { equals: gameQuery } }, { name: { contains: gameQuery } }] }
    });

    if (servers.length === 0) return interaction.reply({ content: `Could not find server matching \`${gameQuery}\`.`, ephemeral: true });
    
    const server = servers[0];

    if (subcommand === "create") {
      if (server.status === "RUNNING" || server.status === "STARTING") {
        return interaction.reply({ content: `**${server.name}** must be offline to create a manual backup (to prevent file corruption). Please stop the server first using \`/server stop ${server.game}\`.`, ephemeral: true });
      }

      await interaction.reply({ content: `📦 Creating backup for **${server.name}**...\nEstimated time: ~10 seconds` });
      try {
        const backup = await createBackup(server.id, "MANUAL", `Discord Backup - ${new Date().toLocaleDateString()}`);
        await interaction.followUp(`✅ Backup Completed!\n\n**Name:** ${backup.name}\n**Size:** ${(backup.fileSizeMB).toFixed(2)} MB`);
      } catch (e: any) {
        await interaction.followUp(`🔴 Failed to create backup: ${e.message}`);
      }
    }

    if (subcommand === "list") {
      const backups = await prisma.backup.findMany({
        where: { serverId: server.id },
        orderBy: { createdAt: "desc" },
        take: 5
      });

      if (backups.length === 0) return interaction.reply({ content: `No backups found for **${server.name}**.`, ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle(`Backups for ${server.name}`)
        .setDescription(backups.map(b => `**${b.name}**\nDate: ${b.createdAt.toLocaleString()}\nSize: ${(b.fileSizeMB).toFixed(2)} MB`).join("\n\n"));

      await interaction.reply({ embeds: [embed] });
    }
  },
};
