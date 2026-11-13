import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/system/notifications   → masked delivery config + health
// PUT /api/system/notifications   { smtpHost?, smtpPort?, smtpSecure?, smtpUser?, smtpPass?, smtpFrom?, discordWebhook? }
//
// Install-wide notification delivery (ADMIN only): SMTP for email alerts and
// a Discord webhook for server-wide pings. Secrets (smtpPass, the webhook
// URL) are never returned — GET reports `configured` booleans instead, and a
// blank password on PUT means "keep the saved one" (same contract as the S3
// settings route).

const WEBHOOK_URL_RE = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//;

const putSchema = z.object({
  smtpHost: z.string().trim().max(255).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().trim().max(255).optional(),
  // Empty/absent = keep the saved password; null clears it.
  smtpPass: z.string().max(255).nullish(),
  smtpFrom: z.string().trim().max(255).optional(),
  discordWebhook: z.string().trim().max(500).nullish(),
});

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

async function requireAdmin() {
  const user = await getAuthenticatedUser();
  if (!user) return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as NextResponse, user: null };
  if (user.role !== "ADMIN") return { denied: NextResponse.json({ error: "Requires ADMIN" }, { status: 403 }) as NextResponse, user: null };
  return { denied: null, user };
}

/** Masked view of the settings row — safe to show, no secrets. */
async function describe() {
  const row = await prisma.notificationSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);
  const hasSmtp = !!row?.smtpHost;
  return {
    smtp: {
      configured: hasSmtp,
      host: row?.smtpHost ?? "",
      port: row?.smtpPort ?? 587,
      secure: row?.smtpSecure ?? false,
      user: row?.smtpUser ?? "",
      from: row?.smtpFrom ?? "",
      passwordConfigured: !!row?.smtpPass,
    },
    discord: {
      webhookConfigured: !!row?.discordWebhook,
    },
    health: {
      lastError: row?.lastError ?? null,
      lastSentAt: row?.lastSentAt?.toISOString() ?? null,
    },
  };
}

export async function GET(_req: NextRequest) {
  try {
    const { denied } = await requireAdmin();
    if (denied) return denied;
    return NextResponse.json(await describe());
  } catch (error) {
    console.error("GET /api/system/notifications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { denied } = await requireAdmin();
    if (denied) return denied;

    const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notification settings payload" }, { status: 400 });
    }
    const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom, discordWebhook } = parsed.data;

    const webhook = clean(discordWebhook);
    if (webhook && !WEBHOOK_URL_RE.test(webhook)) {
      return NextResponse.json(
        { error: "Discord webhook URL must look like https://discord.com/api/webhooks/..." },
        { status: 400 }
      );
    }

    const existing = await prisma.notificationSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);
    // Blank password = keep the saved credential; explicit null clears it.
    const nextPass = smtpPass === undefined || smtpPass === "" ? existing?.smtpPass ?? null : clean(smtpPass);

    const data = {
      smtpHost: clean(smtpHost),
      smtpPort: smtpPort ?? existing?.smtpPort ?? 587,
      smtpSecure: smtpSecure ?? existing?.smtpSecure ?? false,
      smtpUser: clean(smtpUser),
      smtpPass: nextPass,
      smtpFrom: clean(smtpFrom),
      discordWebhook: webhook,
    };

    // Saving (or clearing) config invalidates the old failure note — the UI
    // should reflect the config as it is now, not how the last send went.
    await prisma.notificationSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: { ...data, lastError: null },
    });

    return NextResponse.json(await describe());
  } catch (error) {
    console.error("PUT /api/system/notifications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
