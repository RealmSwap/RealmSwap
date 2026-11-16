import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { getNotificationConfig, sendEmail, sendDiscordWebhook, recordNotificationHealth } from "@/lib/notifications";

// POST /api/system/notifications/test   { channel: "email" | "discord" }
//
// Fires one real delivery through the saved config and reports the actual
// error text on failure — the point of this endpoint is that a broken SMTP
// password or dead webhook says so on screen instead of failing silently in
// the background.

const testSchema = z.object({ channel: z.enum(["email", "discord"]) });

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Requires ADMIN" }, { status: 403 });

    const parsed = testSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'channel must be "email" or "discord"' }, { status: 400 });
    }

    const cfg = await getNotificationConfig();
    try {
      if (parsed.data.channel === "email") {
        if (!cfg.smtpHost) {
          return NextResponse.json({ error: "SMTP is not configured — save a host first." }, { status: 400 });
        }
        const to = user.email;
        await sendEmail(cfg, to, "RealmSwap test notification", "If you can read this, email delivery works.");
        await recordNotificationHealth(true);
        return NextResponse.json({ ok: true, message: `Test email sent to ${to}.` });
      } else {
        if (!cfg.discordWebhook) {
          return NextResponse.json({ error: "Discord webhook is not configured — save a URL first." }, { status: 400 });
        }
        await sendDiscordWebhook(cfg, "RealmSwap test notification", "If you can read this, webhook delivery works.");
        await recordNotificationHealth(true);
        return NextResponse.json({ ok: true, message: "Test message posted to your Discord webhook." });
      }
    } catch (err: any) {
      const message = String(err?.message || err);
      await recordNotificationHealth(false, message);
      // Surface the real error (status line, SMTP reply, whatever the
      // transport gave us) instead of swallowing it.
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
  } catch (error) {
    console.error("POST /api/system/notifications/test error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
