import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { findAuthorizedServer } from "../utils/auth";
import { getServerLogTail } from "../../lib/serverLogs";

export default {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Fetch the latest server console logs")
    .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    .addIntegerOption(option => option.setName("lines").setDescription("Number of lines to fetch (default: 15, max: 50)").setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const gameQuery = interaction.options.getString("game")?.toLowerCase();
    const lines = Math.min(interaction.options.getInteger("lines") || 15, 50);

    const { error, server } = await findAuthorizedServer(interaction, gameQuery);
    
    if (error || !server) {
      return interaction.reply({ content: error, ephemeral: true });
    }

    const logs = getServerLogTail(server.id, lines);
    
    // Discord embed descriptions have a limit of 4096 chars.
    // Trim if necessary, keeping the end.
    let displayLogs = logs;
    if (displayLogs.length > 3900) {
        displayLogs = "...\n" + displayLogs.substring(displayLogs.length - 3900);
    }

    const embed = new EmbedBuilder()
      .setColor(0x3B82F6) // Blue
      .setTitle(`📜 Latest Logs: ${server.name}`)
      .setDescription(`\`\`\`log\n${displayLogs}\n\`\`\``)
      .setFooter({ text: `Showing last ${lines} lines` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
