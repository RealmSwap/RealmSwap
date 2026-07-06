import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { findAuthorizedServer } from "../utils/auth";
import { getServerLogTail } from "../../lib/serverLogs";

export default {
  data: new SlashCommandBuilder()
    .setName("diagnose")
    .setDescription("Run an AI/Heuristic diagnostic scan on the server logs to find crashes")
    .addStringOption(option => option.setName("game").setDescription("Name of the game/server").setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const gameQuery = interaction.options.getString("game")?.toLowerCase();

    const { error, server } = await findAuthorizedServer(interaction, gameQuery);
    
    if (error || !server) {
      return interaction.reply({ content: error, ephemeral: true });
    }

    await interaction.deferReply();

    const logs = getServerLogTail(server.id, 50); // Get last 50 lines for diagnostics
    
    // Simple heuristic parser (Flight Recorder Foundation)
    let diagnosis = "Everything appears to be running normally! No common crash signatures detected in the last 50 lines.";
    let color = 0x10B981; // Green

    if (logs.includes("java.net.BindException") || logs.includes("Address already in use") || logs.includes("port is already in use")) {
      diagnosis = "**Port Conflict Detected!**\nAnother application (or another game server) is already using this port. Try stopping the other server or changing this server's port in the GameVault Dashboard.";
      color = 0xEF4444; // Red
    } else if (logs.includes("OutOfMemoryError") || logs.includes("Out of memory")) {
      diagnosis = "**Out of Memory Crash!**\nThe server ran out of RAM. Try increasing the RAM allocation in the GameVault Config Editor, or check if a specific Mod is causing a memory leak.";
      color = 0xEF4444;
    } else if (logs.includes("MissingModException") || logs.includes("ModResolutionException") || logs.includes("requires mod")) {
      diagnosis = "**Mod Dependency Error!**\nThe server is missing a required mod, or there is a version mismatch. Check the modlist and ensure all dependencies are installed.";
      color = 0xF59E0B; // Orange
    } else if (logs.includes("EULA")) {
      diagnosis = "**EULA Not Accepted!**\nMinecraft requires you to accept the EULA. GameVault usually handles this automatically, but it seems to have failed. Please check the `eula.txt` file.";
      color = 0xF59E0B;
    } else if (logs.includes("Exception in server tick loop")) {
      diagnosis = "**Tick Loop Crash!**\nThe server took too long to calculate a tick and crashed. This is usually caused by too many entities, an infinite loop in a mod, or a corrupted world chunk.";
      color = 0xEF4444;
    }

    // Optional AI Hook (If they provide an API key in the future, we can inject it here)
    if (process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY) {
      // diagnosis += "\n\n*(AI API Key detected! Real AI analysis coming soon...)*";
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`🩺 Diagnostic Report: ${server.name}`)
      .setDescription(diagnosis)
      .setFooter({ text: "GameVault Automated Flight Recorder" });

    await interaction.followUp({ embeds: [embed] });
  },
};
