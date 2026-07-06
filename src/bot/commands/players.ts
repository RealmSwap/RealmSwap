import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { findAuthorizedServer } from "../utils/auth";
import { prisma } from "../../lib/db";
import { parseSpec } from "../../lib/definitions/serialize";
import { renderTemplate } from "../../lib/definitions/template";
import { GameDig } from "gamedig";

export default {
  data: new SlashCommandBuilder()
    .setName("players")
    .setDescription("See who is currently online")
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
    if (server.status !== "RUNNING") return interaction.reply({ content: `**${server.name}** is not running.`, ephemeral: true });

    await interaction.deferReply();

    try {
      let record = server.definitionId 
        ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
        : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });

      if (!record) throw new Error("Definition not found");

      const spec = parseSpec(record.spec);
      if (!spec.queryType) return interaction.followUp(`**${server.name}** does not support player queries.`);

      const paramValues = typeof server.paramValues === "string" ? JSON.parse(server.paramValues) : {};
      const ctx = {
        name: server.name,
        nameSanitized: server.name.replace(/[^a-zA-Z0-9]/g, "_"),
        password: server.password || "",
        port: server.port,
        ram: server.ramAllocation,
        ...paramValues,
      };

      let queryPort = server.port;
      if (spec.queryPort) queryPort = parseInt(renderTemplate(spec.queryPort, ctx), 10);

      const state = await GameDig.query({
        type: spec.queryType as any,
        host: "127.0.0.1",
        port: queryPort,
      });

      const playerNames = state.players.map((p: any) => p.name || "Unknown Player").filter(n => n.trim() !== "");
      
      const embed = new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle(`🟢 ${state.name || server.name}`)
        .setDescription(`**Players:** ${state.players.length}/${state.maxplayers}`)
        .addFields({ name: "Online Now", value: playerNames.length > 0 ? playerNames.map(p => `🟢 ${p}`).join("\n") : "Nobody is online." });

      await interaction.followUp({ embeds: [embed] });
    } catch (e: any) {
      console.error(e);
      await interaction.followUp(`Failed to query **${server.name}**. It might still be starting up.`);
    }
  },
};
