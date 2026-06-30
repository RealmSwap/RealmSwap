import { SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { prisma } from "../../lib/db";
import { LocalRunner } from "../../lib/runners/localRunner";

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

    // Find the user by their Discord ID to ensure they are authorized
    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (!user) {
      return interaction.reply({
        content: `You don't have permission to use this command. Link your Discord ID in the GameVault Dashboard Settings.`,
        ephemeral: true,
      });
    }

    // Search for a server matching the query
    const servers = await prisma.server.findMany({
      where: {
        OR: [
          { game: { equals: gameQuery } },
          { name: { contains: gameQuery } }
        ]
      }
    });

    if (servers.length === 0) {
      return interaction.reply({
        content: `Could not find any server matching \`${gameQuery}\`.`,
        ephemeral: true,
      });
    }

    const server = servers[0]; // If multiple, just pick the first one

    if (server.status === "RUNNING") {
      return interaction.reply({
        content: `🟢 **${server.name}** is already running!\n**Join IP:** \`${server.ipAddress}:${server.port}\``,
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
        await prisma.server.update({
          where: { id: server.id },
          data: { status: "STARTING" },
        });

        // Use LocalRunner to start the server
        const runner = new LocalRunner();
        await runner.start(server);
        
        await prisma.server.update({
          where: { id: server.id },
          data: { status: "RUNNING" },
        });

        await interaction.followUp(`🟢 **${server.name} Ready**\n\nJoin: \`${server.ipAddress}:${server.port}\``);
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
