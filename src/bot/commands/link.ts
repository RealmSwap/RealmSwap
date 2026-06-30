import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../lib/db";

export default {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord account to GameVault"),

  async execute(interaction: ChatInputCommandInteraction) {
    const existingUser = await prisma.user.findUnique({
      where: { discordId: interaction.user.id }
    });

    if (existingUser) {
      return interaction.reply({
        content: `Your Discord account is already linked to the GameVault user **${existingUser.name}**!`,
        ephemeral: true
      });
    }

    // Generate a random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store in DB
    await prisma.discordLinkCode.create({
      data: {
        code,
        discordId: interaction.user.id,
        expiresAt
      }
    });

    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6) // Purple
      .setTitle("🔗 Link GameVault Account")
      .setDescription(`To link your Discord account to GameVault:\n\n1. Go to the GameVault Web Dashboard.\n2. Navigate to **Settings**.\n3. Enter this code in the Discord Linking section:\n\n# ${code}\n\n*This code expires in 15 minutes.*`);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true // Only the user who ran the command can see it
    });
  },
};
