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

// Email + Discord webhook delivery config lives in the NotificationSettings
// singleton (ADMIN-editable in Settings → Notifications) so the packaged app
// — which injects no SMTP env vars — can deliver. Env vars stay as the
// per-field fallback for dev setups configured before this row existed.
export interface NotificationConfig {
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
  discordWebhook: string | null;
}

type NotificationSettingsRow = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
  discordWebhook: string | null;
};

export async function getNotificationConfig(): Promise<NotificationConfig> {
  let row: NotificationSettingsRow | null = null;
  try {
    row = await prisma.notificationSettings.findUnique({ where: { id: "singleton" } });
  } catch {
    // Table missing or DB unavailable — env fallback below still applies.
  }
  return {
    smtpHost: row?.smtpHost ?? process.env.SMTP_HOST ?? null,
    smtpPort: row?.smtpPort ?? (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587),
    smtpSecure: row?.smtpSecure ?? process.env.SMTP_SECURE === "true",
    smtpUser: row?.smtpUser ?? process.env.SMTP_USER ?? null,
    smtpPass: row?.smtpPass ?? process.env.SMTP_PASS ?? null,
    smtpFrom: row?.smtpFrom ?? null,
    discordWebhook: row?.discordWebhook ?? null,
  };
}

/** Stamp delivery health on the settings row (shown in Settings). Never throws — background sends must not break on a health write. */
export async function recordNotificationHealth(ok: boolean, error?: string): Promise<void> {
  const data = ok ? { lastError: null, lastSentAt: new Date() } : { lastError: (error || "Unknown error").slice(0, 500) };
  try {
    await prisma.notificationSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: data,
    });
  } catch {
    // Health recording is best-effort (row/table may not exist yet).
  }
}

/** Send one email. Throws with the real SMTP error — callers decide whether to swallow (background) or surface (test endpoint). */
export async function sendEmail(cfg: NotificationConfig, to: string, title: string, message: string): Promise<void> {
  if (!cfg.smtpHost) throw new Error("SMTP is not configured — set the host in Settings → Notifications.");
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: cfg.smtpUser && cfg.smtpPass ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });
  await transporter.sendMail({
    from: cfg.smtpFrom || (cfg.smtpUser ? `"GameVault Notifications" <${cfg.smtpUser}>` : "GameVault Notifications"),
    to,
    subject: title,
    text: message,
    html: `<h3>${title}</h3><p>${message}</p>`,
  });
}

/** Post one embed to the configured Discord webhook. Throws with the real HTTP error. */
export async function sendDiscordWebhook(cfg: NotificationConfig, title: string, message: string): Promise<void> {
  if (!cfg.discordWebhook) throw new Error("Discord webhook is not configured — set the URL in Settings → Notifications.");
  const res = await fetch(cfg.discordWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{ title, description: message, color: 0x8B5CF6 }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord webhook returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}

export async function sendNotification(
  userId: string,
  title: string,
  message: string,
  // `kind` lets the push handler (public/sw.js) offer actions that fit: a
  // connectivity alert must not carry the one-tap "Restart Server" a crash
  // alert does — restarting a server people may be on over LAN isn't the fix.
  opts?: { serverId?: string; kind?: "connectivity" }
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { PushSubscription: true }
    });

    if (!user) return;

    const cfg = await getNotificationConfig();

    // 1. Discord DM (bot token path, per-user opt-in)
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
        } else {
          await recordNotificationHealth(false, `Discord bot DM returned ${dmRes.status}`);
        }
      } catch (err: any) {
        console.error("Failed to send Discord DM", err);
        await recordNotificationHealth(false, `Discord bot DM: ${err?.message || err}`);
      }
    }

    // 1b. Discord webhook (install-wide server alert; no bot process needed)
    if (cfg.discordWebhook) {
      try {
        await sendDiscordWebhook(cfg, title, message);
        await recordNotificationHealth(true);
      } catch (err: any) {
        console.error("Failed to send Discord webhook", err);
        await recordNotificationHealth(false, `Discord webhook: ${err?.message || err}`);
      }
    }

    // 2. Email
    if (user.notifyEmail && user.email) {
      try {
        await sendEmail(cfg, user.email, title, message);
        await recordNotificationHealth(true);
      } catch (err: any) {
        console.error("Failed to send Email", err);
        await recordNotificationHealth(false, `Email: ${err?.message || err}`);
      }
    }

    // 3. Web Push
    if (user.notifyWebPush && user.PushSubscription && user.PushSubscription.length > 0 && ensureVapidConfigured()) {
      const payload = JSON.stringify({ title, body: message, serverId: opts?.serverId, kind: opts?.kind });

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
