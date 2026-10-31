/**
 * Operations sweep (PR-C): automations (CRUD + manual execute against safe
 * actions), admin egg import, user preferences/settings, the Discord link
 * codes (seeded directly — the bot that normally mints them needs Discord
 * credentials), web-push provisioning, the billing kill-switch, system
 * metrics/docker-status, and the internal-token shutdown (last — it stops
 * tunnels and any running servers).
 */

import fs from "fs";
import path from "path";
import { expect } from "../client";
import { DATA_DIR, INTERNAL_TOKEN } from "../config";
import { scenario, step, pollUntil, type ScenarioContext } from "./framework";
import { memberClient } from "./surface";
import { prisma } from "../dbFixture";

async function latestExecution(ctx: ScenarioContext, serverId: string, automationId: string): Promise<any> {
  const res = await ctx.admin.get(`/api/servers/${serverId}/automations/${automationId}`);
  expect(res.status === 200, `automation read → ${res.status}`);
  return (res.body?.executions ?? [])[0] ?? null;
}

export const opsScenarios = [
  scenario(
    "ops/user-system",
    "automations/execute, egg import, user prefs/settings, discord-link, web-push, billing gate, metrics/docker/shutdown",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const serverId = ctx.state.surfaceServerId as string;
      const member = await memberClient(ctx);

      await step("admin/import-egg: role gate, parse errors, real import, slug collision", async () => {
        const memberDenied = await member.post("/api/admin/import-egg", { eggJson: "{}" });
        expect(memberDenied.status === 403, `member import-egg → ${memberDenied.status}, want 403`);
        const empty = await admin.post("/api/admin/import-egg", {});
        expect(empty.status === 400, `missing eggJson → ${empty.status}, want 400`);
        const notJson = await admin.post("/api/admin/import-egg", { eggJson: "not json at all" });
        expect(notJson.status === 500, `unparsable egg → ${notJson.status}, want 500`);

        const egg = {
          name: "E2E Egg Game",
          description: "imported by the harness",
          image: "ghcr.io/e2e/game:latest",
          startup: "./start --port {{SERVER_PORT}}",
          variables: [
            { name: "Port", env_variable: "SERVER_PORT", default_value: "25565", user_viewable: true, user_editable: true, rules: "required|numeric" },
          ],
        };
        const res = await admin.post("/api/admin/import-egg", { eggJson: JSON.stringify(egg) });
        expect(res.status === 200, `import → ${res.status}: ${res.text.slice(0, 300)}`);
        expect(res.body?.definition?.slug === "e2e-egg-game", `slug → ${res.body?.definition?.slug}`);
        expect(res.body?.definition?.installMethod === "CUSTOM_SCRIPT", "eggs import as custom-script definitions");
        expect(JSON.stringify(res.body?.definition?.spec).includes("SERVER_PORT"), "startup template rewritten to $VARs");

        const dup = await admin.post("/api/admin/import-egg", { eggJson: JSON.stringify(egg) });
        expect(dup.status === 500, `slug collision → ${dup.status}, want 500`);
      });

      let cronId = "";
      let discordId = "";
      let stopperId = "";
      await step("automations: create/validate/list, ADMIN gate", async () => {
        const denied = await member.post(`/api/servers/${serverId}/automations`, {
          name: "member auto", triggerType: "CRON", triggerConfig: { cronExpression: "* * * * *" }, actions: [{ type: "STOP_SERVER" }],
        });
        expect(denied.status === 403, `member create → ${denied.status}, want 403`);

        const cron = await admin.post(`/api/servers/${serverId}/automations`, {
          name: "e2e announce",
          triggerType: "CRON",
          triggerConfig: { cronExpression: "*/5 * * * *" },
          actions: [{ type: "DISCORD_ANNOUNCEMENT", config: {} }],
        });
        expect(cron.status === 201, `create cron → ${cron.status}: ${cron.text.slice(0, 300)}`);
        cronId = cron.body?.id;
        expect(!!cron.body?.nextRunAt, "scheduled trigger computes nextRunAt");
        expect(typeof cron.body?.triggerConfig === "string", "triggerConfig persisted as JSON string");

        const crash = await admin.post(`/api/servers/${serverId}/automations`, {
          name: "e2e crash reaction", triggerType: "SERVER_CRASH", actions: [{ type: "STOP_SERVER", config: {} }],
        });
        expect(crash.status === 201 && crash.body?.nextRunAt === null, "event trigger has no nextRunAt");
        discordId = crash.body?.id;

        const daily = await admin.post(`/api/servers/${serverId}/automations`, {
          name: "bad daily", triggerType: "DAILY", triggerConfig: {}, actions: [{ type: "STOP_SERVER" }],
        });
        expect(daily.status === 400, `DAILY without timeOfDay → ${daily.status}, want 400`);
        const strict = await admin.post(`/api/servers/${serverId}/automations`, {
          name: "strict", triggerType: "CRON", triggerConfig: { cronExpression: "* * * * *", bogus: 1 }, actions: [{ type: "STOP_SERVER" }],
        });
        expect(strict.status === 400, `unknown triggerConfig key → ${strict.status}, want 400 (strict schema)`);
        const oneTime = await admin.post(`/api/servers/${serverId}/automations`, {
          name: "past one-time", triggerType: "ONE_TIME", triggerConfig: { runAt: "2020-01-01T00:00" }, actions: [{ type: "STOP_SERVER" }],
        });
        expect(oneTime.status === 400 && String(oneTime.body?.error).includes("future"), "ONE_TIME in the past refused");

        const list = await admin.get(`/api/servers/${serverId}/automations`);
        expect(list.status === 200 && (list.body ?? []).length >= 2, "list includes both automations");
        const memberList = await member.get(`/api/servers/${serverId}/automations`);
        expect(memberList.status === 404, `stranger list → ${memberList.status}, want 404`);
      });

      await step("execute: fire-and-forget with observable outcomes", async () => {
        // The crash automation (STOP_SERVER on a stopped server) skips cleanly.
        const res = await admin.post(`/api/servers/${serverId}/automations/${discordId}/execute`);
        expect(res.status === 200 && res.body?.success === true, `execute → ${res.status}`);
        const done = await pollUntil(
          () => latestExecution(ctx, serverId, discordId),
          (exec) => exec && exec.status !== "RUNNING",
          15_000
        );
        expect(done?.status === "SUCCESS", `stop-on-stopped execution → ${done?.status}`);
        expect(
          JSON.stringify(done?.logs ?? []).includes("already stopped"),
          `log names the skip → ${JSON.stringify(done?.logs)}`
        );

        // The cron automation's Discord announcement skips without a webhook.
        await admin.post(`/api/servers/${serverId}/automations/${cronId}/execute`);
        const announced = await pollUntil(
          () => latestExecution(ctx, serverId, cronId),
          (exec) => exec && exec.status !== "RUNNING",
          15_000
        );
        expect(announced?.status === "SUCCESS", `discord announcement execution → ${announced?.status}`);
        expect(
          JSON.stringify(announced?.logs ?? []).includes("webhookUrl"),
          `log names the missing webhook → ${JSON.stringify(announced?.logs)}`
        );

        const stopper = await admin.post(`/api/servers/${serverId}/automations`, {
          name: "e2e stopper", triggerType: "SERVER_CRASH",
          actions: [{ type: "STOP_SERVER", config: {} }, { type: "E2E_UNKNOWN_ACTION", config: {} }],
        });
        stopperId = stopper.body?.id;
        await admin.post(`/api/servers/${serverId}/automations/${stopperId}/execute`);
        const failed = await pollUntil(
          () => latestExecution(ctx, serverId, stopperId),
          (exec) => exec && exec.status !== "RUNNING",
          15_000
        );
        expect(failed?.status === "FAILED" && JSON.stringify(failed.logs).includes("E2E_UNKNOWN_ACTION"), `unknown action fails the run → ${JSON.stringify(failed?.logs)}`);

        const missing = await admin.post(`/api/servers/${serverId}/automations/no-such-automation/execute`);
        expect(missing.status === 404, `execute unknown automation → ${missing.status}, want 404`);
      });

      await step("automation update + delete", async () => {
        const put = await admin.put(`/api/servers/${serverId}/automations/${cronId}`, { enabled: false });
        expect(put.status === 200 && put.body?.enabled === false, `PUT enabled:false → ${put.status}`);
        const replaced = await admin.put(`/api/servers/${serverId}/automations/${cronId}`, {
          actions: [{ type: "STOP_SERVER", config: {} }],
        });
        expect(replaced.status === 200 && (replaced.body?.actions ?? []).length === 1, "actions replaced wholesale");
        const del = await admin.delete(`/api/servers/${serverId}/automations/${cronId}`);
        expect(del.status === 200 && del.body?.success === true, "automation deleted");
        const gone = await admin.get(`/api/servers/${serverId}/automations/${cronId}`);
        expect(gone.status === 404, `deleted automation → ${gone.status}, want 404`);
        await admin.delete(`/api/servers/${serverId}/automations/${discordId}`);
        await admin.delete(`/api/servers/${serverId}/automations/${stopperId}`);
      });

      await step("user preferences persist; settings PUT is a guarded no-op", async () => {
        const prefs = await admin.post("/api/user/preferences", { notifyEmail: false });
        expect(prefs.status === 200 && prefs.body?.preferences?.notifyEmail === false, `preferences → ${prefs.text.slice(0, 200)}`);
        expect(prefs.body?.preferences?.notifyDiscord === true, "unset flags keep their defaults");
        const noop = await admin.put("/api/user/settings", { name: "E2E Renamed" });
        expect(noop.status === 200, `PUT settings → ${noop.status}`);
        expect(noop.body?.user?.name !== "E2E Renamed", "settings PUT persists nothing (discord links only via the bot)");
        const discordGuard = await admin.put("/api/user/settings", { discordId: "123456" });
        expect(discordGuard.status === 400 && String(discordGuard.body?.error).includes("bot"), "discordId rejected with the bot-link message");
      });

      await step("discord-link: seeded codes, single use, expiry, collision, rate limit", async () => {
        const adminId = (await prisma.user.findFirstOrThrow({ where: { email: "e2e-admin@realmswap.test" } })).id;
        const memberId = (await prisma.user.findFirstOrThrow({ where: { email: "e2e-member@realmswap.test" } })).id;
        await prisma.discordLinkCode.createMany({
          data: [
            { code: "777001", discordId: "100000000000000001", expiresAt: new Date(Date.now() + 15 * 60_000) },
            { code: "777002", discordId: "100000000000000001", expiresAt: new Date(Date.now() + 15 * 60_000) },
            { code: "777003", discordId: "100000000000000002", expiresAt: new Date(Date.now() - 60_000) },
          ],
        });

        const noCode = await admin.post("/api/user/discord-link", {});
        expect(noCode.status === 400, `missing code → ${noCode.status}, want 400`);
        const first = await admin.post("/api/user/discord-link", { code: "777001" });
        expect(first.status === 200 && first.body?.success === true, `valid code → ${first.status}`);
        const consumed = await admin.post("/api/user/discord-link", { code: "777001" });
        expect(consumed.status === 400, `single-use code → ${consumed.status}, want 400`);
        const expired = await admin.post("/api/user/discord-link", { code: "777003" });
        expect(expired.status === 400 && String(expired.body?.error).includes("expired"), "expired code refused");

        // Second code for the SAME discord account collides on the member.
        const collision = await member.post("/api/user/discord-link", { code: "777002" });
        expect(collision.status === 409, `discord account already linked → ${collision.status}, want 409`);

        // Rate limit: 5 attempts / 15 min per user. Admin used 3 so far.
        await admin.post("/api/user/discord-link", { code: "999999" });
        await admin.post("/api/user/discord-link", { code: "999999" });
        const limited = await admin.post("/api/user/discord-link", { code: "999999" });
        expect(limited.status === 429, `6th attempt → ${limited.status}, want 429`);
        void adminId; void memberId;
      });

      await step("web-push: vapid provisioning + subscription storage", async () => {
        const unauth = await fetch(`${admin.baseUrl}/api/web-push/vapid`);
        expect(unauth.status === 200, `vapid is public → ${unauth.status}, want 200`);
        const key1 = (await unauth.json())?.publicKey;
        expect(typeof key1 === "string" && key1.length > 0, `publicKey → ${key1}`);
        const second = await fetch(`${admin.baseUrl}/api/web-push/vapid`);
        expect((await second.json())?.publicKey === key1, "vapid key is stable across calls");
        expect(fs.existsSync(path.join(DATA_DIR, "push-vapid-keys.json")), "keypair persisted under the data dir");

        const unauthSub = await fetch(`${admin.baseUrl}/api/web-push/subscribe`, { method: "POST", body: "{}" });
        expect(unauthSub.status === 401, `unauth subscribe → ${unauthSub.status}, want 401`);
        const bad = await admin.post("/api/web-push/subscribe", {});
        expect(bad.status === 400, `empty subscription → ${bad.status}, want 400`);
        const sub = {
          endpoint: "https://push.e2e.realmswap.test/fake-endpoint",
          keys: { p256dh: "e2e-p256dh-key", auth: "e2e-auth-key" },
        };
        const first = await admin.post("/api/web-push/subscribe", sub);
        expect(first.status === 200 && first.body?.success === true, `subscribe → ${first.status}`);
        const again = await admin.post("/api/web-push/subscribe", sub);
        expect(again.status === 200 && String(again.body?.message || "").includes("already exists"), "duplicate subscription deduped");
      });

      await step("billing: disabled builds answer a flat 404, even unauthenticated", async () => {
        for (const route of ["checkout", "portal", "refresh"]) {
          const res = await admin.post(`/api/billing/${route}`, { priceId: "e2e" });
          expect(res.status === 404 && res.body?.error === "Not found", `billing/${route} → ${res.status}`);
          const unauth = await fetch(`${admin.baseUrl}/api/billing/${route}`, { method: "POST" });
          expect(unauth.status === 404, `unauth billing/${route} → ${unauth.status} (flag check precedes auth)`);
        }
      });

      await step("system surfaces: metrics, docker status", async () => {
        const metrics = await admin.get("/api/system/metrics");
        expect(metrics.status === 200, `metrics → ${metrics.status}`);
        expect((metrics.body?.memory?.totalGB ?? 0) > 0, "totalGB reported");
        expect(metrics.body?.memory?.freeGB <= metrics.body?.memory?.totalGB, "freeGB ≤ totalGB");
        const unauth = await fetch(`${admin.baseUrl}/api/system/metrics`);
        expect(unauth.status === 401, `unauth metrics → ${unauth.status}, want 401`);

        const docker = await admin.get("/api/system/docker-status");
        expect(docker.status === 200, `docker-status → ${docker.status}`);
        // The contract is an honest availability probe, not a value: ubuntu CI
        // runners have Docker, the mac harness host does not.
        expect(typeof docker.body?.available === "boolean", `docker availability → ${docker.body?.available}`);
      });

      await step("shutdown: internal-token gated, app survives (called LAST)", async () => {
        const noToken = await admin.post("/api/system/shutdown");
        expect(noToken.status === 403 && noToken.body?.error === "forbidden", `no token → ${noToken.status}`);
        const wrong = await admin.post("/api/system/shutdown", undefined, { headers: { "x-internal-token": "wrong-token" } });
        expect(wrong.status === 403, `wrong token → ${wrong.status}`);
        const res = await admin.post("/api/system/shutdown", undefined, { headers: { "x-internal-token": INTERNAL_TOKEN } });
        expect(res.status === 200, `shutdown → ${res.status}: ${res.text.slice(0, 200)}`);
        expect(res.body?.stopped === 0, `stopped count → ${res.body?.stopped} (nothing was running)`);
        const still = await admin.get("/api/system/metrics");
        expect(still.status === 200, "the app keeps serving after shutdown (it stops services, not itself)");
      });
    }
  ),
];
