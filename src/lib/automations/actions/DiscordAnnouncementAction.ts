import { AutomationActionInterface, AutomationContext } from "../types";

export class DiscordAnnouncementAction implements AutomationActionInterface {
  id = "DISCORD_ANNOUNCEMENT";
  name = "Discord Announcement";
  description = "Sends a message to the connected Discord server.";

  async execute(context: AutomationContext, config: any): Promise<void> {
    const message = config?.message || "Automated server event occurred.";
    const webhookUrl = config?.webhookUrl;
    
    if (!webhookUrl) {
      await context.log("Skipping Discord announcement: No webhookUrl configured.");
      return;
    }

    // The URL is owner-configured and the app POSTs to it from the server —
    // anything other than a Discord webhook would turn this action into an
    // internal-network request primitive.
    if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(webhookUrl)) {
      await context.log("Skipping Discord announcement: webhookUrl must be a https://discord.com/api/webhooks/… URL.");
      return;
    }

    await context.log(`Sending Discord announcement via webhook...`);
    
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message,
          username: "RealmSwap Hub",
          avatar_url: "https://github.com/RealmSwap.png"
        })
      });
      if (!res.ok) throw new Error(`Webhook failed with status: ${res.status}`);
      await context.log("Discord announcement sent successfully.");
    } catch (e: any) {
      await context.log(`Failed to send Discord announcement: ${e.message}`);
    }
  }
}
