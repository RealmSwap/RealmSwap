import { SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { prisma } from "../../lib/db";
import { findAuthorizedServer } from "../utils/auth";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Start a game server quickly!")
    .addStringOption(option =>
      option.setName("game")
        .setDescription("The name or type of the game (e.g. minecraft, valheim)")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const gameQuery = interaction.options.getString("game")?.toLowerCase();

    const { error, server, user } = await findAuthorizedServer(interaction, gameQuery);
    
    if (error || !server) {
      return interaction.reply({ content: error, ephemeral: true });
    }

    if (server.status === "RUNNING") {
      let joinInfo = `\`${server.ipAddress}:${server.port}\``;
      if (server.inviteCode) {
        joinInfo += `\n**Invite Code:** \`${server.inviteCode}\` *(Use with RealmSync)*`;
      }

      return interaction.reply({
        content: `🟢 **${server.name}** is already running!\n**Join:** ${joinInfo}`,
      });
    }

    if (server.status === "STARTING") {
      return interaction.reply({
        content: `⏳ **${server.name}** is currently starting up... Please wait!`,
      });
    }

    // It's offline or crashed. Ask to start.
    const startButton = new ButtonBuilder()
      .setCustomId("start_server")
      .setLabel("Start Server")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton);

    const response = await interaction.reply({
      content: `**${server.name}** is currently offline.\nEstimated startup: 28 seconds`,
      components: [row],
      fetchReply: true,
    });

    // Await button click
    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: `These buttons aren't for you!`, ephemeral: true });
        return;
      }

      await i.update({ content: `⚡ Starting **${server.name}**...`, components: [] });

      try {
        // Use the internal API so Next.js handles it and emits SSE events to the dashboard
        const res = await fetch("http://localhost:3000/api/bot/action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.DISCORD_BOT_TOKEN}`
          },
          body: JSON.stringify({ action: "start", serverId: server.id })
        });

        if (!res.ok) {
          throw new Error("API responded with " + res.status);
        }

        // RE-FETCH the server from DB so we get the fresh Public IP resolved by the runner!
        const { prisma } = require("../../lib/db");
        const updatedServer = await prisma.server.findUnique({ where: { id: server.id } });

        let joinInfo = `\`${updatedServer.ipAddress}:${updatedServer.port}\``;
        if (updatedServer.inviteCode) {
          joinInfo += `\n**Invite Code:** \`${updatedServer.inviteCode}\` *(Use with RealmSync)*`;
        }

        await interaction.followUp(`🟢 **${updatedServer.name} Ready**\n\nJoin: ${joinInfo}`);
      } catch (error) {
        console.error("Failed to start server:", error);
        await prisma.server.update({
          where: { id: server.id },
          data: { status: "CRASHED" },
        });
        await interaction.followUp(`🔴 Failed to start **${server.name}**. Check the dashboard logs.`);
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.editReply({ components: [] }).catch(console.error);
      }
    });
  },
};
