import { Events, Interaction } from "discord.js";
import { BotClient } from "../index";

export default {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    if (interaction.isButton()) {
      if (interaction.customId === "plan_join" || interaction.customId === "plan_leave") {
        await handlePlanButton(interaction);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const client = interaction.client as BotClient;
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    }
  },
};

async function handlePlanButton(interaction: any) {
  const { prisma } = require("../../lib/db");
  const session = await prisma.plannedSession.findFirst({ where: { messageId: interaction.message.id } });
  if (!session) {
    return interaction.reply({ content: "This session is no longer active or tracked.", ephemeral: true });
  }

  let roster: string[] = JSON.parse(session.roster);
  const userId = interaction.user.id;

  if (interaction.customId === "plan_join") {
    if (!roster.includes(userId)) roster.push(userId);
  } else if (interaction.customId === "plan_leave") {
    roster = roster.filter(id => id !== userId);
  }

  await prisma.plannedSession.update({
    where: { id: session.id },
    data: { roster: JSON.stringify(roster) }
  });

  const embed = interaction.message.embeds[0];
  const newEmbed = {
    ...embed.data,
    fields: [
      { name: `Roster (${roster.length})`, value: roster.length > 0 ? roster.map(id => `<@${id}>`).join("\n") : "None yet" }
    ]
  };

  await interaction.update({ embeds: [newEmbed] });
}
