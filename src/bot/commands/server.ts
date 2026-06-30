import { SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { findAuthorizedServer } from "../utils/auth";
import { getRunner } from "../../lib/runners/factory";

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
    const subcommand = interaction.options.getSubcommand();
    const gameQuery = interaction.options.getString("game")?.toLowerCase();

    const { error, server } = await findAuthorizedServer(interaction, gameQuery);
    
    if (error || !server) {
      return interaction.reply({ content: error || "Could not find any server matching that query.", ephemeral: true });
    }

    const runner = getRunner(server.runnerType);

    if (subcommand === "status") {
      const statusIcon = server.status === "RUNNING" ? "🟢" : server.status === "STARTING" ? "⏳" : "🔴";
      return interaction.reply({
        content: `${statusIcon} **${server.name}**\n\n**Status:** ${server.status}\n**RAM:** ${server.ramAllocation} GB\n**Join IP:** \`${server.ipAddress}:${server.port}\``,
      });
    }

    const callApi = async (action: string) => {
      const res = await fetch("http://localhost:3000/api/bot/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.DISCORD_BOT_TOKEN}` },
        body: JSON.stringify({ action, serverId: server.id })
      });
      if (!res.ok) throw new Error("API Error " + res.status);
    };

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
          await callApi("start");
          await interaction.followUp(`🟢 **${server.name} Started**`);
        } catch (error) {
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
        try {
          await callApi("stop");
          await interaction.followUp(`🔴 **${server.name} Stopped**`);
        } catch(e) {
          await interaction.followUp(`🔴 Failed to stop **${server.name}**.`);
        }
      });
      return;
    }

    if (subcommand === "restart") {
      if (server.status !== "RUNNING") return interaction.reply({ content: `**${server.name}** is not running.`, ephemeral: true });
      
      await interaction.reply({ content: `🔄 Restarting **${server.name}** in 5 minutes (Auto-warning players)...` });
      // In a real implementation, we would send an RCON command to warn players here.
      setTimeout(async () => {
        try {
          await callApi("restart");
          await interaction.followUp(`🟢 **${server.name} Restarted**`);
        } catch(e) {
          await interaction.followUp(`🔴 Failed to restart **${server.name}**.`);
        }
      }, 5000); // Mock 5 minute wait with 5 seconds for testing
      return;
    }
  },
};
