import { SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { prisma } from "../../lib/db";
import { LocalRunner } from "../../lib/runners/localRunner";

export default {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Manage GameVault servers")
    .addSubcommand(subcommand =>
      subcommand
        .setName("status")
        .setDescription("Check the status of a server")
        .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("start")
        .setDescription("Start a server")
        .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("stop")
        .setDescription("Stop a server")
        .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("restart")
        .setDescription("Restart a server")
        .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (!user) {
      return interaction.reply({
        content: `You don't have permission to use this command. Link your Discord ID in the GameVault Dashboard Settings.`,
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const gameQuery = interaction.options.getString("game")?.toLowerCase();

    const servers = await prisma.server.findMany({
      where: {
        OR: [
          { game: { equals: gameQuery } },
          { name: { contains: gameQuery } }
        ]
      }
    });

    if (servers.length === 0) {
      return interaction.reply({ content: `Could not find any server matching \`${gameQuery}\`.`, ephemeral: true });
    }

    const server = servers[0];
    const runner = new LocalRunner();

    if (subcommand === "status") {
      const statusIcon = server.status === "RUNNING" ? "🟢" : server.status === "STARTING" ? "⏳" : "🔴";
      return interaction.reply({
        content: `${statusIcon} **${server.name}**\n\n**Status:** ${server.status}\n**RAM:** ${server.ramAllocation} GB\n**Join IP:** \`${server.ipAddress}:${server.port}\``,
      });
    }

    if (subcommand === "start") {
      if (server.status === "RUNNING") return interaction.reply({ content: `**${server.name}** is already running.`, ephemeral: true });
      
      const startButton = new ButtonBuilder()
        .setCustomId("start_server")
        .setLabel("Start")
        .setStyle(ButtonStyle.Success);
      const cancelButton = new ButtonBuilder()
        .setCustomId("cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton, cancelButton);

      const response = await interaction.reply({
        content: `⚠️ This will start **${server.name}**.\nEstimated startup: 25 seconds`,
        components: [row],
        fetchReply: true,
      });

      const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: `These buttons aren't for you!`, ephemeral: true });
          return;
        }
        if (i.customId === "cancel") {
          await i.update({ content: "Startup cancelled.", components: [] });
          return;
        }

        await i.update({ content: `⚡ Starting **${server.name}**...`, components: [] });
        try {
          await prisma.server.update({ where: { id: server.id }, data: { status: "STARTING" }});
          await runner.start(server);
          await prisma.server.update({ where: { id: server.id }, data: { status: "RUNNING" }});
          await interaction.followUp(`🟢 **${server.name} Started**`);
        } catch (error) {
          await prisma.server.update({ where: { id: server.id }, data: { status: "CRASHED" }});
          await interaction.followUp(`🔴 Failed to start **${server.name}**.`);
        }
      });
      return;
    }

    if (subcommand === "stop") {
      if (server.status !== "RUNNING") return interaction.reply({ content: `**${server.name}** is not running.`, ephemeral: true });
      
      const stopButton = new ButtonBuilder().setCustomId("stop_server").setLabel("Stop").setStyle(ButtonStyle.Danger);
      const cancelButton = new ButtonBuilder().setCustomId("cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton, cancelButton);

      const response = await interaction.reply({
        content: `⚠️ **${server.name}** is currently running.\n\nContinue with shutdown?`,
        components: [row],
        fetchReply: true,
      });

      const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) return i.reply({ content: `Not for you!`, ephemeral: true });
        if (i.customId === "cancel") return i.update({ content: "Shutdown cancelled.", components: [] });

        await i.update({ content: `🛑 Stopping **${server.name}**...`, components: [] });
        await runner.stop(server.id);
        await prisma.server.update({ where: { id: server.id }, data: { status: "STOPPED" }});
        await interaction.followUp(`🔴 **${server.name} Stopped**`);
      });
      return;
    }

    if (subcommand === "restart") {
      if (server.status !== "RUNNING") return interaction.reply({ content: `**${server.name}** is not running.`, ephemeral: true });
      
      await interaction.reply({ content: `🔄 Restarting **${server.name}** in 5 minutes (Auto-warning players)...` });
      // In a real implementation, we would send an RCON command to warn players here.
      setTimeout(async () => {
        await runner.stop(server.id);
        await prisma.server.update({ where: { id: server.id }, data: { status: "STARTING" }});
        await runner.start(server);
        await prisma.server.update({ where: { id: server.id }, data: { status: "RUNNING" }});
        await interaction.followUp(`🟢 **${server.name} Restarted**`);
      }, 5000); // Mock 5 minute wait with 5 seconds for testing
      return;
    }
  },
};
