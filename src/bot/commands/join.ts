import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { findAuthorizedServer } from "../utils/auth";

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
    const gameQuery = interaction.options.getString("game")?.toLowerCase();
    
    const { error, server } = await findAuthorizedServer(interaction, gameQuery);
    
    if (error || !server) {
      return interaction.reply({ content: error, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle(`Join ${server.name}`)
      .setDescription(server.status === "RUNNING" ? "🟢 **Online**" : "🔴 **Offline**")
      .addFields(
        { name: "Address", value: `\`${server.ipAddress || "localhost"}\``, inline: true },
        { name: "Port", value: `\`${server.port}\``, inline: true }
      );

    if (server.inviteCode) {
      embed.addFields({ name: "Invite Code", value: `\`${server.inviteCode}\` *(Use with RealmSync)*`, inline: false });
    }

    if (server.password && server.password.trim() !== "") {
      embed.addFields({ name: "Password", value: `||${server.password}||`, inline: false });
    } else {
      embed.addFields({ name: "Password", value: `None`, inline: false });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
