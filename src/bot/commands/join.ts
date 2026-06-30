import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../lib/db";

export default {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Get connection info for a server")
    .addStringOption(option =>
      option.setName("game")
        .setDescription("The name or type of the game")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
    if (!user) return interaction.reply({ content: `You don't have permission.`, ephemeral: true });

    const gameQuery = interaction.options.getString("game")?.toLowerCase();
    const servers = await prisma.server.findMany({
      where: { OR: [{ game: { equals: gameQuery } }, { name: { contains: gameQuery } }] }
    });

    if (servers.length === 0) return interaction.reply({ content: `Could not find any server matching \`${gameQuery}\`.`, ephemeral: true });
    
    const server = servers[0];

    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle(`Join ${server.name}`)
      .setDescription(server.status === "RUNNING" ? "🟢 **Online**" : "🔴 **Offline**")
      .addFields(
        { name: "Address", value: `\`${server.ipAddress || "localhost"}\``, inline: true },
        { name: "Port", value: `\`${server.port}\``, inline: true }
      );

    if (server.password && server.password.trim() !== "") {
      embed.addFields({ name: "Password", value: `||${server.password}||`, inline: false });
    } else {
      embed.addFields({ name: "Password", value: `None`, inline: false });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
