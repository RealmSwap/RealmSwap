import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { findAuthorizedServer } from "../utils/auth";
import { advertisedGameAddress } from "../../lib/advertisedAddress";

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

    // The bot process can't see the API process's live agent map, so tunnel
    // liveness here is the DB flag (cleared on agent exit and app boot).
    const address = advertisedGameAddress(server, !!server.tunnelUrl);

    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle(`Join ${server.name}`)
      .setDescription(server.status === "RUNNING" ? "🟢 **Online**" : "🔴 **Offline**")
      .addFields(
        { name: "Address", value: `\`${address}\``, inline: true },
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

    // Ephemeral: the embed carries the server password and the full
    // RealmSync invite secret — neither belongs in the public channel.
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
