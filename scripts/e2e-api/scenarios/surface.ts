/**
 * Server-surface sweep (PR-C): config, settings, connectivity, status-share +
 * the public /s/<code> page, the servers/stream SSE heartbeat, import-world,
 * the Minecraft update refusal, log archives, and the cloud advisor.
 *
 * Everything runs against its own STOPPED Minecraft server — none of these
 * routes needs a booted process (the stopped-server behaviors ARE the honest
 * contract: blocked connectivity report, players:null status page, config
 * edits applied immediately).
 */

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { expect } from "../client";
import { MEMBER_USER_AFTER_ROTATION } from "./auth";
import { DATA_DIR } from "../config";
import { scenario, step, type ScenarioContext } from "./framework";

export function serverDir(serverId: string): string {
  return path.join(DATA_DIR, "local-servers", serverId);
}

/** A second logged-in browser (the member account from the auth scenario). */
export async function memberClient(ctx: ScenarioContext) {
  if (ctx.state.memberClient) return ctx.state.memberClient as import("../client").ApiClient;
  const { ApiClient } = await import("../client");
  const member = new ApiClient(ctx.admin.baseUrl);
  const res = await member.post("/api/auth/login", MEMBER_USER_AFTER_ROTATION);
  expect(res.status === 200, `member login → ${res.status}`);
  ctx.state.memberClient = member;
  return member;
}

export const surfaceScenarios = [
  scenario(
    "surface/server-surface",
    "config/settings/connectivity/status-share/public status page/SSE stream/import-world/update refusal/log archives/advisor",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const definitionId = ctx.state.definitionId as string;
      expect(!!definitionId, "surface scenario needs the MC definition from mcLifecycle");

      const member = await memberClient(ctx);

      let serverId = "";
      await step("create the surface server", async () => {
        const res = await admin.post("/api/servers", {
          name: "E2E Surface Server",
          definitionId,
          ramAllocation: 2,
        });
        expect(res.status === 200 || res.status === 201, `create → ${res.status}: ${res.text.slice(0, 200)}`);
        serverId = res.body?.server?.id ?? res.body?.id;
        expect(!!serverId, "create response carries a server id");
        ctx.state.surfaceServerId = serverId;
      });

      await step("config: member is denied, owner round-trips server.properties", async () => {
        const denied = await member.get(`/api/servers/${serverId}/config`);
        expect(denied.status === 404, `member GET config → ${denied.status}, want 404`);

        const initial = await admin.get(`/api/servers/${serverId}/config`);
        expect(initial.status === 200, `GET config → ${initial.status}`);
        expect(initial.body?.filename === "server.properties", `filename → ${initial.body?.filename}`);
        expect(initial.body?.editable === true, "Minecraft config must be editable");

        const put = await admin.put(`/api/servers/${serverId}/config`, {
          content: "# e2e surface config\nmotd=e2e-surface-motd\n",
        });
        expect(put.status === 200, `PUT config → ${put.status}: ${put.text.slice(0, 200)}`);
        const onDisk = fs.readFileSync(path.join(serverDir(serverId), "server.properties"), "utf8");
        expect(onDisk.includes("motd=e2e-surface-motd"), "PUT wrote server.properties to the server dir");
        const reread = await admin.get(`/api/servers/${serverId}/config`);
        expect(reread.body?.content === "# e2e surface config\nmotd=e2e-surface-motd\n", "GET returns the written content verbatim");

        const bad = await admin.put(`/api/servers/${serverId}/config`, { content: 42 });
        expect(bad.status === 400, `PUT non-string content → ${bad.status}, want 400`);
      });

      await step("settings: fields, applied-now render, validation and POST actions", async () => {
        const get = await admin.get(`/api/servers/${serverId}/settings`);
        expect(get.status === 200, `GET settings → ${get.status}`);
        expect(get.body?.supportsSettings === true, "settings supported for Minecraft");
        expect(
          Array.isArray(get.body?.fields) && get.body.fields.some((f: any) => f.key === "motd"),
          "field list carries the motd param"
        );

        const put = await admin.put(`/api/servers/${serverId}/settings`, { paramValues: { motd: "e2e-surface-motd" } });
        expect(put.status === 200, `PUT settings → ${put.status}: ${put.text.slice(0, 200)}`);
        expect(put.body?.appliedNow === true, "stopped server renders params immediately (appliedNow)");
        const onDisk = fs.readFileSync(path.join(serverDir(serverId), "server.properties"), "utf8");
        expect(onDisk.includes("motd=e2e-surface-motd"), "settings PUT re-rendered server.properties");

        const invalid = await admin.put(`/api/servers/${serverId}/settings`, { paramValues: { maxPlayers: 5000 } });
        expect(invalid.status === 400, `PUT maxPlayers=5000 → ${invalid.status}, want 400`);

        const toggle = await admin.post(`/api/servers/${serverId}/settings`, { action: "TOGGLE_AUTO_UPDATE", enable: true });
        expect(toggle.status === 200 && toggle.body?.autoUpdate === true, `TOGGLE_AUTO_UPDATE → ${toggle.status}`);
        const badHour = await admin.post(`/api/servers/${serverId}/settings`, { action: "SET_UPDATE_HOUR", hour: 99 });
        expect(badHour.status === 400, `SET_UPDATE_HOUR 99 → ${badHour.status}, want 400`);
        const unknown = await admin.post(`/api/servers/${serverId}/settings`, { action: "NOT_AN_ACTION" });
        expect(unknown.status === 400, `unknown action → ${unknown.status}, want 400`);
        const sftp = await admin.post(`/api/servers/${serverId}/settings`, { action: "REGENERATE_SFTP" });
        expect(sftp.status === 200 && typeof sftp.body?.sftpPassword === "string", "REGENERATE_SFTP returns a password");
      });

      await step("connectivity: honest blocked report while stopped", async () => {
        const res = await admin.get(`/api/servers/${serverId}/connectivity`);
        expect(res.status === 200, `connectivity → ${res.status}: ${res.text.slice(0, 200)}`);
        const ids = (res.body?.report?.checks ?? []).map((c: any) => c.id);
        expect(JSON.stringify(ids) === JSON.stringify(["server", "listen", "router", "firewall"]), `check ids → ${ids}`);
        expect(res.body?.report?.overall === "blocked", `overall → ${res.body?.report?.overall}, want blocked`);
        expect(
          (res.body?.report?.checks ?? []).some((c: any) => c.id === "server" && c.status === "fail"),
          "the server check must fail while STOPPED"
        );
        expect(typeof res.body?.invite?.address === "string" && res.body.invite.address.includes("25565"), "invite carries the game address");
        expect(res.body?.statusShare?.code === null, "no status-share code yet");
        const denied = await member.get(`/api/servers/${serverId}/connectivity`);
        expect(denied.status === 403, `member connectivity → ${denied.status}, want 403 (ADMIN-only)`);
      });

      let code1 = "";
      let code2 = "";
      await step("status-share: enable/rotate/disable + the public page", async () => {
        const enable = await admin.post(`/api/servers/${serverId}/status-share`, { action: "enable" });
        expect(enable.status === 200, `enable → ${enable.status}`);
        code1 = enable.body?.code ?? "";
        expect(/^[0-9a-f]{8}$/.test(code1), `code shape → ${code1}`);
        const again = await admin.post(`/api/servers/${serverId}/status-share`, { action: "enable" });
        expect(again.body?.code === code1, "enable is idempotent");
        const rotate = await admin.post(`/api/servers/${serverId}/status-share`, { action: "rotate" });
        code2 = rotate.body?.code ?? "";
        expect(code2 !== code1 && /^[0-9a-f]{8}$/.test(code2), "rotate mints a fresh code");
        const bogus = await admin.post(`/api/servers/${serverId}/status-share`, { action: "bogus" });
        expect(bogus.status === 400, `bogus action → ${bogus.status}, want 400`);
        ctx.state.statusShareCode = code2;

        // The public page needs no session at all.
        const { ApiClient } = await import("../client");
        const anon = new ApiClient(admin.baseUrl);
        const page = await anon.get(`/api/s/${code2}`);
        expect(page.status === 200, `GET /api/s/<code> → ${page.status}`);
        expect(page.body?.code === code2 && page.body?.status === "STOPPED", "page reflects the stopped server");
        expect(page.body?.players === null && page.body?.maxplayers === null, "no player data while stopped (no leak)");
        expect(Array.isArray(page.body?.weekly) && page.body.weekly.length === 7, "weekly grid is 7 rows");
        expect((page.headers.get("cache-control") || "").includes("no-store"), "public page is no-store");
        const missing = await anon.get("/api/s/00000000");
        expect(missing.status === 404, `unknown code → ${missing.status}, want 404 (a disabled code can serve its 20s cache — not asserted)`);
        const share = await admin.get(`/api/servers/${serverId}/connectivity`);
        expect(share.body?.statusShare?.code === code2, "connectivity surfaces the active share code");
      });

      await step("update: Minecraft refuses SteamCMD, honestly", async () => {
        const res = await admin.post(`/api/servers/${serverId}/update`);
        expect(res.status === 400, `update MC → ${res.status}, want 400`);
        expect(String(res.body?.error || "").includes("server.jar"), "refusal names the jar-replacement path");
        const missing = await admin.post(`/api/servers/not-a-real-id/update`);
        expect(missing.status === 404, `update unknown id → ${missing.status}, want 404`);
      });

      await step("import-world: swaps a world folder atomically", async () => {
        const world = "/tmp/realmswap-e2e-import-world";
        fs.rmSync(world, { recursive: true, force: true });
        fs.mkdirSync(world, { recursive: true });
        fs.writeFileSync(path.join(world, "level.dat"), "e2e level data");

        const res = await admin.post(`/api/servers/${serverId}/import-world`, { sourcePath: world });
        expect(res.status === 200, `import-world → ${res.status}: ${res.text.slice(0, 200)}`);
        expect(fs.existsSync(path.join(serverDir(serverId), "world", "level.dat")), "level.dat landed in the server world dir");

        const missing = await admin.post(`/api/servers/${serverId}/import-world`, { sourcePath: "/tmp/definitely-missing-e2e-xyz" });
        expect(missing.status === 400 && String(missing.body?.error || "").includes("exist"), "missing path rejected");
        const empty = await admin.post(`/api/servers/${serverId}/import-world`, {});
        expect(empty.status === 400, `empty body → ${empty.status}, want 400`);
        const file = path.join(serverDir(serverId), "server.properties");
        const notDir = await admin.post(`/api/servers/${serverId}/import-world`, { sourcePath: file });
        expect(notDir.status === 400 && String(notDir.body?.error || "").includes("folder"), "a plain file is rejected");
      });

      await step("log archives: empty → seeded zip → content read", async () => {
        const list = await admin.get(`/api/servers/${serverId}/logs/archives`);
        expect(list.status === 200, `archives list → ${list.status}`);
        expect((list.body?.archives ?? []).length === 0, "fresh server has no rotated logs");

        const zipName = "server-log-2026-10-30T00-00-00-000Z.zip";
        const zip = new AdmZip();
        zip.addFile("server.log", Buffer.from("e2e archived log line\n"));
        fs.writeFileSync(path.join(serverDir(serverId), zipName), zip.toBuffer());

        const seeded = await admin.get(`/api/servers/${serverId}/logs/archives`);
        expect((seeded.body?.archives ?? []).length === 1, "seeded archive is listed");
        expect(seeded.body.archives[0].name === zipName, "archive name matches");
        expect(typeof seeded.body.archives[0].createdAt === "string", "createdAt is an ISO string");

        const content = await admin.get(`/api/servers/${serverId}/logs/archives/${zipName}`);
        expect(content.status === 200, `archive content → ${content.status}`);
        expect(content.body?.content === "e2e archived log line\n" && content.body?.truncated === false, "log content round-trips");
        const missing = await admin.get(`/api/servers/${serverId}/logs/archives/server-log-nope.zip`);
        expect(missing.status === 404, `missing archive → ${missing.status}, want 404`);
      });

      await step("advisor: offline scoring, no keys needed", async () => {
        const res = await admin.post(`/api/servers/${serverId}/advisor/analyze`, { preferences: { priority: "Cheapest" } });
        expect(res.status === 200, `advisor → ${res.status}: ${res.text.slice(0, 200)}`);
        expect(res.body?.readiness?.score === 40, `vanilla MC score → ${res.body?.readiness?.score}, want 40`);
        expect(res.body?.readiness?.recommendation === "STAY_LOCAL", "vanilla MC stays local");
        expect(res.body?.readiness?.metrics?.modCount === 0, "modCount is 0");
        expect((res.body?.recommendations ?? []).length === 3, "up to 3 provider recommendations");
      });

      await step("servers/stream: SSE heartbeats for a session, 401 without", async () => {
        const unauth = await fetch(`${admin.baseUrl}/api/servers/stream`);
        expect(unauth.status === 401, `unauth stream → ${unauth.status}, want 401`);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 17_000);
        try {
          const res = await fetch(`${admin.baseUrl}/api/servers/stream`, {
            headers: { cookie: admin.cookie() },
            signal: controller.signal,
          });
          expect(res.status === 200, `stream → ${res.status}`);
          expect((res.headers.get("content-type") || "").includes("text/event-stream"), "SSE content type");
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let sawPing = false;
          const deadline = Date.now() + 17_000;
          while (Date.now() < deadline && !sawPing) {
            const { value, done } = await reader.read();
            if (done) break;
            if (decoder.decode(value, { stream: true }).includes(": ping")) sawPing = true;
          }
          expect(sawPing, "no heartbeat frame within 17s (SSE_HEARTBEAT is 15s)");
        } finally {
          clearTimeout(timer);
          controller.abort();
        }
      });

      await step("teardown: disable status sharing for later scenarios", async () => {
        await admin.post(`/api/servers/${serverId}/status-share`, { action: "disable" });
      });
    }
  ),
];
