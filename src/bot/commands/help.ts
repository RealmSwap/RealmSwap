import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { BotClient } from "../index";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all available GameVault commands"),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as BotClient;
    
    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6) // Purple
      .setTitle("🎮 GameVault Bot Commands")
      .setDescription("Here is a list of everything you can do with the GameVault bot:");

    const categories: Record<string, string[]> = {
      "🚀 Server Control": ["play", "server"],
      "👥 Players & Access": ["join", "players", "access", "link"],
      "🛠️ Management": ["plan", "backup", "logs", "diagnose", "mods"],
    };

    // Helper to find command description
    const getDesc = (name: string) => {
      const cmd = client.commands.get(name);
      return cmd ? cmd.data.description : "No description available.";
    };

    for (const [category, cmds] of Object.entries(categories)) {
      const commandList = cmds
        .filter(name => client.commands.has(name))
        .map(name => `**/${name}** - ${getDesc(name)}`)
        .join("\n");
        
      if (commandList) {
        embed.addFields({ name: category, value: commandList });
      }
    }

    embed.setFooter({ text: "Powered by RealmSwap" });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
