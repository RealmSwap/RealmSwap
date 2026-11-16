import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route + delivery-health guards for the notification config API: the ADMIN
 * gate, secret masking on GET, PUT validation (webhook shape, port range,
 * blank-means-keep password), the test endpoint surfacing the real send
 * error, and background sends recording lastError/lastSentAt. Prisma, auth,
 * nodemailer and fetch are all mocked.
 */

const bag = vi.hoisted(() => ({
  user: null as { id: string; role: string; email: string } | null,
  row: null as any,
  upserts: [] as any[],
  appUser: null as any,
  sendMail: null as ((msg?: any) => Promise<any>) | null,
  fetchImpl: null as ((url: string, init?: any) => Promise<any>) | null,
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: async () => bag.user,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    notificationSettings: {
      findUnique: async () => bag.row,
      upsert: async (args: any) => {
        bag.upserts.push(args);
        bag.row = { id: "singleton", ...(bag.row || {}), ...args.create, ...args.update };
        return bag.row;
      },
    },
    user: {
      findUnique: async () => bag.appUser,
    },
  },
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: (msg: any) => {
        if (!bag.sendMail) throw new Error("no sendMail mock for this test");
        return bag.sendMail(msg);
      },
    }),
  },
}));

import { GET as getConfig, PUT as putConfig } from "../notifications/route";
import { POST as postTest } from "../notifications/test/route";
import { sendNotification } from "@/lib/notifications";

const get = () => getConfig(new NextRequest("http://localhost/api/system/notifications"));
const put = (body: unknown) =>
  putConfig(new NextRequest("http://localhost/api/system/notifications", { method: "PUT", body: JSON.stringify(body) }));
const test = (body: unknown) =>
  postTest(new NextRequest("http://localhost/api/system/notifications/test", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  bag.user = { id: "admin-1", role: "ADMIN", email: "admin@example.com" };
  bag.row = null;
  bag.upserts = [];
  bag.appUser = null;
  bag.sendMail = null;
  bag.fetchImpl = null;
  for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "DISCORD_BOT_TOKEN"]) delete process.env[k];
  vi.stubGlobal("fetch", ((url: string, init?: any) => {
    if (!bag.fetchImpl) throw new Error(`unexpected fetch to ${url}`);
    return bag.fetchImpl(url, init);
  }) as any);
});

describe("GET /api/system/notifications", () => {
  it("is ADMIN-only", async () => {
    bag.user = null;
    expect((await get()).status).toBe(401);
    bag.user = { id: "u", role: "USER", email: "u@example.com" };
    expect((await get()).status).toBe(403);
  });

  it("never returns secrets — masked booleans instead", async () => {
    bag.row = {
      id: "singleton",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "me@gmail.com",
      smtpPass: "hunter2-secret",
      smtpFrom: "RealmSwap <me@gmail.com>",
      discordWebhook: "https://discord.com/api/webhooks/123456/token-value",
      lastError: "Email: boom",
      lastSentAt: new Date("2026-01-01T00:00:00Z"),
    };
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("hunter2-secret");
    expect(JSON.stringify(body)).not.toContain("token-value");
    expect(body.smtp.passwordConfigured).toBe(true);
    expect(body.discord.webhookConfigured).toBe(true);
    expect(body.smtp.configured).toBe(true);
    expect(body.smtp.host).toBe("smtp.gmail.com");
    expect(body.health.lastError).toBe("Email: boom");
    expect(body.health.lastSentAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("reports an empty config when no row exists", async () => {
    const body = await (await get()).json();
    expect(body.smtp.configured).toBe(false);
    expect(body.smtp.passwordConfigured).toBe(false);
    expect(body.discord.webhookConfigured).toBe(false);
    expect(body.health.lastError).toBeNull();
  });
});

describe("PUT /api/system/notifications", () => {
  it("rejects a webhook URL outside Discord's webhook endpoints", async () => {
    const res = await put({ discordWebhook: "https://evil.example/api/webhooks/123/token" });
    expect(res.status).toBe(400);
    expect(bag.upserts).toHaveLength(0);
  });

  it("rejects out-of-range ports", async () => {
    expect((await put({ smtpPort: 0 })).status).toBe(400);
    expect((await put({ smtpPort: 70000 })).status).toBe(400);
    expect(bag.upserts).toHaveLength(0);
  });

  it("saves config and masks secrets in the response", async () => {
    const res = await put({
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: "me@gmail.com",
      smtpPass: "hunter2-secret",
      smtpFrom: "RealmSwap <me@gmail.com>",
      discordWebhook: "https://discord.com/api/webhooks/123456/token-value",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("hunter2-secret");
    expect(JSON.stringify(body)).not.toContain("token-value");
    expect(body.smtp.configured).toBe(true);
    expect(bag.upserts[0].update.smtpPass).toBe("hunter2-secret");
  });

  it("keeps the saved password when the field comes back blank", async () => {
    bag.row = { id: "singleton", smtpHost: "old", smtpPass: "hunter2-secret" };
    await put({ smtpHost: "smtp.gmail.com", smtpPass: "" });
    expect(bag.upserts[0].update.smtpPass).toBe("hunter2-secret");
  });

  it("clears lastError on save so stale failures do not linger", async () => {
    bag.row = { id: "singleton", smtpHost: "old", lastError: "Email: dead" };
    const body = await (await put({ smtpHost: "smtp.gmail.com" })).json();
    expect(body.health.lastError).toBeNull();
    expect(bag.upserts[0].update.lastError).toBeNull();
  });
});

describe("POST /api/system/notifications/test", () => {
  it("is ADMIN-only", async () => {
    bag.user = { id: "u", role: "USER", email: "u@example.com" };
    expect((await test({ channel: "email" })).status).toBe(403);
  });

  it("returns 400 when the channel is not configured", async () => {
    expect((await test({ channel: "email" })).status).toBe(400);
    expect((await test({ channel: "discord" })).status).toBe(400);
  });

  it("surfaces the real SMTP error text and records it as lastError", async () => {
    bag.row = { id: "singleton", smtpHost: "smtp.gmail.com", smtpUser: "me@gmail.com", smtpPass: "bad" };
    bag.sendMail = async () => {
      throw new Error("535 Authentication failed");
    };
    const res = await test({ channel: "email" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("535 Authentication failed");
    const health = bag.upserts.find((u) => u.update.lastError);
    expect(health.update.lastError).toContain("535 Authentication failed");
  });

  it("records success (lastSentAt, no lastError) and reports ok", async () => {
    bag.row = { id: "singleton", smtpHost: "smtp.gmail.com", smtpUser: "me@gmail.com", smtpPass: "good" };
    bag.sendMail = async (msg: any) => {
      expect(msg.to).toBe("admin@example.com");
      return {};
    };
    const body = await (await test({ channel: "email" })).json();
    expect(body.ok).toBe(true);
    const health = bag.upserts[0];
    expect(health.update.lastError).toBeNull();
    expect(health.update.lastSentAt).toBeInstanceOf(Date);
  });

  it("surfaces the webhook HTTP status when Discord rejects", async () => {
    bag.row = { id: "singleton", discordWebhook: "https://discord.com/api/webhooks/123/token" };
    bag.fetchImpl = async () => ({ ok: false, status: 404, text: async () => "Unknown Webhook" });
    const res = await test({ channel: "discord" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("404");
    expect(body.error).toContain("Unknown Webhook");
  });

  it("posts a real webhook on success", async () => {
    bag.row = { id: "singleton", discordWebhook: "https://discord.com/api/webhooks/123/token" };
    let sent: any = null;
    bag.fetchImpl = async (url: string, init?: any) => {
      sent = { url, body: JSON.parse(init.body) };
      return { ok: true, status: 200 };
    };
    const body = await (await test({ channel: "discord" })).json();
    expect(body.ok).toBe(true);
    expect(sent.url).toBe("https://discord.com/api/webhooks/123/token");
    expect(sent.body.embeds[0].title).toMatch(/test/i);
  });
});

describe("background sendNotification delivery health", () => {
  it("records lastError when the email send fails (no more silent swallowing)", async () => {
    bag.appUser = { id: "u1", notifyEmail: true, notifyDiscord: false, notifyWebPush: false, email: "u@example.com", PushSubscription: [] };
    bag.row = { id: "singleton", smtpHost: "smtp.gmail.com", smtpUser: "me@gmail.com", smtpPass: "bad" };
    bag.sendMail = async () => {
      throw new Error("connect ETIMEDOUT");
    };
    await sendNotification("u1", "Server crashed", "Minecraft down");
    const health = bag.upserts.find((u) => u.update.lastError);
    expect(health).toBeTruthy();
    expect(health.update.lastError).toContain("ETIMEDOUT");
    expect(health.update.lastError).toContain("Email:");
  });

  it("records lastError when email has no SMTP config at all — the old silent no-op", async () => {
    bag.appUser = { id: "u1", notifyEmail: true, notifyDiscord: false, notifyWebPush: false, email: "u@example.com", PushSubscription: [] };
    bag.sendMail = async () => ({});
    await sendNotification("u1", "Server crashed", "Minecraft down");
    const health = bag.upserts.find((u) => u.update.lastError);
    expect(health).toBeTruthy();
    expect(health.update.lastError).toContain("SMTP is not configured");
  });

  it("stamps lastSentAt on a successful webhook send", async () => {
    bag.appUser = { id: "u1", notifyEmail: false, notifyDiscord: false, notifyWebPush: false, email: null, PushSubscription: [] };
    bag.row = { id: "singleton", discordWebhook: "https://discord.com/api/webhooks/123/token" };
    bag.fetchImpl = async () => ({ ok: true, status: 200 });
    await sendNotification("u1", "Server crashed", "Minecraft down");
    const health = bag.upserts.find((u) => u.update.lastError === null && u.update.lastSentAt);
    expect(health).toBeTruthy();
    expect(bag.upserts.some((u) => u.update.lastError)).toBe(false);
  });
});
