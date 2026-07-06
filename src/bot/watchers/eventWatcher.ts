import { Client, TextChannel } from "discord.js";
import { prisma } from "../../lib/db";

export function startEventWatcher(client: Client) {
  setInterval(async () => {
    try {
      const now = new Date();
      // Look for events that are starting within the next 15 minutes, and haven't been notified yet
      const upcomingEvents = await prisma.plannedSession.findMany({
        where: {
          notified: false,
          startTime: {
            lte: new Date(now.getTime() + 15 * 60 * 1000), // 15 minutes from now
            gt: now // But hasn't started yet
          }
        },
        include: { server: true }
      });

      for (const event of upcomingEvents) {
        // Mark as notified immediately to avoid duplicate triggers
        await prisma.plannedSession.update({
          where: { id: event.id },
          data: { notified: true }
        });

        const channel = await client.channels.fetch(event.channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          const roster: string[] = JSON.parse(event.roster);
          const mentions = roster.map(id => `<@${id}>`).join(" ");
          
          let joinInfo = `\`${event.server.ipAddress}:${event.server.port}\``;
          if (event.server.inviteCode) {
            joinInfo += `\n**Invite Code:** \`${event.server.inviteCode}\``;
          }

          await (channel as TextChannel).send({
            content: `⏰ **It's almost time!**\n${mentions}\n\nThe planned session **"${event.title}"** for **${event.server.name}** is starting in 15 minutes!\n\n🚀 *Automatically booting up the server now...*\n\n**Join Info:**\n${joinInfo}`
          });
        }

        // Trigger server start by calling our internal API action endpoint
        // Using the same Bearer token logic we use for bot commands
        const fetch = require("node-fetch");
        const TOKEN = process.env.DISCORD_BOT_TOKEN;
        const PORT = process.env.PORT || "3000";
        
        try {
          await fetch(`http://127.0.0.1:${PORT}/api/bot/action`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${TOKEN}`
            },
            body: JSON.stringify({
              serverId: event.server.id,
              action: "start"
            })
          });
        } catch (e) {
          console.error("Failed to trigger server start from eventWatcher", e);
        }
      }
    } catch (err) {
      console.error("Error in eventWatcher interval:", err);
    }
  }, 60 * 1000); // Check every minute
}
