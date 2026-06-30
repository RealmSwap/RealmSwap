import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { findAuthorizedServer } from "../utils/auth";
import { prisma } from "../../lib/db";
import * as chrono from "chrono-node";

export default {
  data: new SlashCommandBuilder()
    .setName("plan")
    .setDescription("Plan a game session and gather a roster")
    .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    .addStringOption(option => option.setName("time").setDescription("When is it? (e.g., 'in 2 hours', 'tomorrow at 8pm')").setRequired(true))
    .addStringOption(option => option.setName("title").setDescription("Event Title (e.g., 'Raid Night', 'Boss Fight')").setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const gameQuery = interaction.options.getString("game")?.toLowerCase();
    const timeQuery = interaction.options.getString("time")!;
    const title = interaction.options.getString("title") || "Game Session";

    const { error, server, user } = await findAuthorizedServer(interaction, gameQuery);
    
    if (error || !server || !user) {
      return interaction.reply({ content: error || "Not found.", ephemeral: true });
    }

    const parsedDate = chrono.parseDate(timeQuery);
    if (!parsedDate) {
      return interaction.reply({ content: `Could not understand the time '${timeQuery}'. Try something like 'in 2 hours' or 'tomorrow at 8pm'.`, ephemeral: true });
    }

    if (parsedDate.getTime() < Date.now()) {
      return interaction.reply({ content: `That time is in the past!`, ephemeral: true });
    }

    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor(0x10B981) // Emerald Green
      .setTitle(`📅 Planned: ${title} (${server.name})`)
      .setDescription(`**Time:** <t:${Math.floor(parsedDate.getTime() / 1000)}:F>\n*(<t:${Math.floor(parsedDate.getTime() / 1000)}:R>)*\n\nThe server will automatically start 15 minutes before this time. Click **I'm In!** to be notified.`)
      .addFields({ name: `Roster (1)`, value: `<@${interaction.user.id}>` })
      .setFooter({ text: `Host: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

    const joinBtn = new ButtonBuilder().setCustomId("plan_join").setLabel("I'm In!").setStyle(ButtonStyle.Success);
    const leaveBtn = new ButtonBuilder().setCustomId("plan_leave").setLabel("Can't Make It").setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn, leaveBtn);

    const message = await interaction.followUp({ embeds: [embed], components: [row] });

    await prisma.plannedSession.create({
      data: {
        serverId: server.id,
        title,
        startTime: parsedDate,
        channelId: interaction.channelId,
        messageId: message.id,
        roster: JSON.stringify([interaction.user.id])
      }
    });
  },
};
