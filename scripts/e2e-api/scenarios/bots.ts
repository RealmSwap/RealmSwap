/**
 * Bot actions (@heavy, PR-C): the Discord bot's HTTP action route with
 * BOT_API_SECRET set in the app env — auth ladder, then the real thing:
 * start → RUNNING → stop → STOPPED on the surface server (a real Minecraft
 * boot, which is why this is heavy).
 */

import fs from "fs";
import path from "path";
import { expect } from "../client";
import { INTERNAL_TOKEN } from "../config";
import { scenario, step, pollUntil, type ScenarioContext } from "./framework";
import { serverDir } from "./surface";

const BOT_SECRET = "e2e-api-harness-bot-secret";

function bearer(secret: string) {
  return { headers: { authorization: `Bearer ${secret}` } };
}

export const botScenarios = [
  scenario(
    "ops/bot-actions",
    "bot/action auth ladder + real start/stop round-trip via the Discord bot path",
    ["heavy"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const serverId = ctx.state.surfaceServerId as string;
      expect(!!serverId, "bot scenario needs the surface server");

      const serverList = await admin.get("/api/servers");
      const before = (serverList.body?.servers ?? []).find((s: any) => s.id === serverId);
      expect(before?.status === "STOPPED", `surface server must be STOPPED to start → ${before?.status}`);

      await step("clear any RUNNING servers (readiness must see THIS server's port)", async () => {
        // Earlier scenarios leave servers RUNNING; a free 25565 is what makes
        // the bot-start poll below honest (a stuck port would read as ready).
        for (const s of serverList.body?.servers ?? []) {
          if (s.status === "RUNNING" || s.status === "STARTING") {
            await admin.post(`/api/servers/${s.id}/stop`);
          }
        }
        await pollUntil(
          async () => {
            const list = await admin.get("/api/servers");
            return (list.body?.servers ?? []).some((s: any) => s.status === "RUNNING" || s.status === "STARTING");
          },
          (anyRunning) => !anyRunning,
          60_000
        );
      });

      await step("auth ladder: wrong bearer 401, bad payload 400, unknown server 404", async () => {
        const noHeader = await admin.post("/api/bot/action", { action: "start", serverId });
        expect(noHeader.status === 401, `no auth → ${noHeader.status}, want 401`);
        const wrong = await admin.post("/api/bot/action", { action: "start", serverId }, bearer("wrong-secret"));
        expect(wrong.status === 401, `wrong bearer → ${wrong.status}, want 401`);
        const bad = await admin.post("/api/bot/action", { action: "status", serverId }, bearer(BOT_SECRET));
        expect(bad.status === 400, `unsupported action → ${bad.status}, want 400`);
        const unknown = await admin.post("/api/bot/action", { action: "start", serverId: "no-such-server" }, bearer(BOT_SECRET));
        expect(unknown.status === 404, `unknown server → ${unknown.status}, want 404`);
      });

      await step("start via the bot → real boot to RUNNING", async () => {
        // Earlier scenarios leave a synthetic level.dat in this world (import
        // and backup fixtures) — Minecraft refuses it at boot. Clear it so
        // the server generates a real world and the boot is genuinely real.
        fs.rmSync(path.join(serverDir(serverId), "world"), { recursive: true, force: true });

        const res = await admin.post("/api/bot/action", { action: "start", serverId }, bearer(BOT_SECRET));
        expect(res.status === 200 && res.body?.success === true, `bot start → ${res.status}: ${res.text.slice(0, 300)}`);
        const reached = await pollUntil(
          async () => {
            const list = await admin.get("/api/servers");
            return (list.body?.servers ?? []).find((s: any) => s.id === serverId)?.status ?? "?";
          },
          (status) => status === "RUNNING" || status === "CRASHED",
          300_000
        );
        expect(reached === "RUNNING", `bot-started server status → ${reached}, want RUNNING`);
        // Prove the boot is real: this server's own console must answer.
        const consoleRes = await admin.post(`/api/servers/${serverId}/console`, { command: "list" });
        expect(consoleRes.status === 200 && consoleRes.body?.success === true, `console after bot boot → ${consoleRes.status}`);
      });

      await step("stop via the bot → clean shutdown", async () => {
        const res = await admin.post("/api/bot/action", { action: "stop", serverId }, bearer(BOT_SECRET));
        expect(res.status === 200 && res.body?.success === true, `bot stop → ${res.status}`);
        const reached = await pollUntil(
          async () => {
            const list = await admin.get("/api/servers");
            return (list.body?.servers ?? []).find((s: any) => s.id === serverId)?.status ?? "?";
          },
          (status) => status === "STOPPED",
          60_000
        );
        expect(reached === "STOPPED", `bot-stopped server status → ${reached}`);
      });

      await step("teardown: internal shutdown clears any residual services", async () => {
        await admin.post("/api/system/shutdown", undefined, { headers: { "x-internal-token": INTERNAL_TOKEN } });
      });
    }
  ),
];
