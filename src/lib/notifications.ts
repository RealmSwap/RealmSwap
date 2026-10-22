import { prisma } from "./db";
import webpush from "web-push";
import nodemailer from "nodemailer";
import { getVapidKeys } from "./vapidKeys";

// Web Push Setup — keys come from env or the auto-provisioned key file; the
// details are configured lazily on first send (see sendNotification).
let vapidConfigured = false;
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails("mailto:admin@realmswap.io", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  } else {
    const keys = getVapidKeys();
    webpush.setVapidDetails("mailto:admin@realmswap.io", keys.publicKey, keys.privateKey);
  }
  vapidConfigured = true;
  return true;
}

// Nodemailer Setup
const transporter = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
}) : null;

export async function sendNotification(
  userId: string,
  title: string,
  message: string,
  opts?: { serverId?: string }
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { PushSubscription: true }
    });

    if (!user) return;

    // 1. Discord DM
    if (user.notifyDiscord && user.discordId && process.env.DISCORD_BOT_TOKEN) {
      try {
        const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
          method: "POST",
          headers: {
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ recipient_id: user.discordId })
        });
        
        if (dmRes.ok) {
          const dmData = await dmRes.json();
          await fetch(`https://discord.com/api/v10/channels/${dmData.id}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              embeds: [{
                title: title,
                description: message,
                color: 0x8B5CF6
              }]
            })
          });
        }
      } catch (err) {
        console.error("Failed to send Discord DM", err);
      }
    }

    // 2. Email
    if (user.notifyEmail && user.email && transporter) {
      try {
        await transporter.sendMail({
          from: `"GameVault Notifications" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: title,
          text: message,
          html: `<h3>${title}</h3><p>${message}</p>`
        });
      } catch (err) {
        console.error("Failed to send Email", err);
      }
    }

    // 3. Web Push
    if (user.notifyWebPush && user.PushSubscription && user.PushSubscription.length > 0 && ensureVapidConfigured()) {
      const payload = JSON.stringify({ title, body: message, serverId: opts?.serverId });
      
      for (const sub of user.PushSubscription) {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          }, payload);
        } catch (err: any) {
          if (err.statusCode === 410) {
            // Subscription has expired or is no longer valid
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          } else {
            console.error("Failed to send Web Push", err);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error in NotificationService:", err);
  }
}
