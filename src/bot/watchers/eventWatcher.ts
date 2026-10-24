import { Client, TextChannel } from "discord.js";
import { prisma } from "../../lib/db";
import { advertisedGameAddress } from "../../lib/advertisedAddress";
import { isAutoStartDue } from "../../lib/sessions";

// Widest lead any server can configure — the query window upper bound; the
// per-server autoStartLeadMinutes decides which of these actually fire.
const MAX_LEAD_MINUTES = 120;

export function startEventWatcher(client: Client) {
  setInterval(async () => {
    try {
      const now = new Date();
      // Sessions starting soon that haven't been notified yet. Each server
      // carries its own lead time (autoStartLeadMinutes), so the query is
      // wide and the exact due-check happens per session below.
      const upcomingEvents = await prisma.plannedSession.findMany({
        where: {
          notified: false,
          startTime: {
            lte: new Date(now.getTime() + MAX_LEAD_MINUTES * 60 * 1000),
            gt: now // But hasn't started yet
          }
        },
        include: { server: true }
      });

      for (const event of upcomingEvents) {
        const leadMinutes = event.server.autoStartLeadMinutes ?? 15;
        if (!isAutoStartDue(event.startTime, leadMinutes, now)) continue;

        // Mark as notified immediately to avoid duplicate triggers
        await prisma.plannedSession.update({
          where: { id: event.id },
          data: { notified: true }
        });

        const channel = await client.channels.fetch(event.channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          const roster: string[] = JSON.parse(event.roster);
          const mentions = roster.map(id => `<@${id}>`).join(" ");

          // Public channel post: the address only — the invite code is a
          // credential and travels per-member via /join (ephemeral).
          const joinInfo = `\`${advertisedGameAddress(event.server, !!event.server.tunnelUrl)}\``;
          const startsIn = leadMinutes <= 1 ? "now" : `in ${leadMinutes} minute${leadMinutes === 1 ? "" : "s"}`;

          await (channel as TextChannel).send({
            content: `⏰ **It's almost time!**\n${mentions}\n\nThe planned session **"${event.title}"** for **${event.server.name}** is starting ${startsIn}!\n\n🚀 *Automatically booting up the server now...*\n\n**Join Info:**\n${joinInfo}`
          });
        }

        // Trigger server start by calling our internal API action endpoint
        // Using the same Bearer token logic we use for bot commands.
        // (Node 18+ global fetch — a `require("node-fetch")` here threw
        // because that package isn't installed, so auto-start never ran.)
        const TOKEN = process.env.BOT_API_SECRET || process.env.DISCORD_BOT_TOKEN;
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
