import { AutomationActionInterface, AutomationContext } from "../types";

export class DiscordAnnouncementAction implements AutomationActionInterface {
  id = "DISCORD_ANNOUNCEMENT";
  name = "Discord Announcement";
  description = "Sends a message to the connected Discord server.";

  async execute(context: AutomationContext, config: any): Promise<void> {
    const message = config?.message || "Automated server event occurred.";
    await context.log(`Sending Discord announcement: ${message}`);
    // Note: Actual Discord integration will use bot/discord client
    // For now we mock the execution
    try {
      const res = await fetch(`http://localhost:3000/api/bot/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: context.server.id, message })
      });
      if (!res.ok) throw new Error("Broadcast failed");
      await context.log("Discord announcement sent successfully.");
    } catch (e: any) {
      await context.log(`Failed to send Discord announcement: ${e.message}`);
    }
  }
}
