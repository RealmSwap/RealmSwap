/**
 * Minecraft server lifecycle end-to-end — the only game whose real dedicated
 * server process boots on non-Windows dev machines (and in CI). This is the
 * first place in the repo where a route-level test drives an actual game
 * process: create → honest readiness (RUNNING only when the port truly
 * accepts) → live query ping → console → logs → SSE log stream → stats family
 * → restart → stop → crash-on-kill → archive/restore.
 */

import net from "net";
import fs from "fs";
import path from "path";
import { ApiClient, expect } from "../client";
import { APP_BASE_URL, BOOT_TIMEOUT_MS, DATA_DIR } from "../config";
import { MEMBER_USER_AFTER_ROTATION } from "./auth";
import { pollUntil, scenario, sleep, step, type ScenarioContext } from "./framework";

function tcpAccepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

async function getServer(admin: import("../client").ApiClient, id: string): Promise<any | null> {
  const res = await admin.get("/api/servers");
  if (res.status !== 200) throw new Error(`GET /api/servers → ${res.status}`);
  return (res.body?.servers ?? []).find((s: any) => s.id === id) ?? null;
}

export const mcLifecycleScenarios = [
  scenario(
    "mc/server-lifecycle",
    "create → honest boot to RUNNING → query/console/logs/stream/stats → restart → stop → crash-on-kill → archive/restore",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      let serverId = "";
      let serverPort = 25565;

      await step("definitions include built-in Minecraft", async () => {
        const res = await admin.get("/api/definitions");
        expect(res.status === 200, `GET /api/definitions → ${res.status}`);
        const mc = (res.body?.definitions ?? res.body ?? []).find?.(
          (d: any) => d.slug === "MINECRAFT"
        );
        expect(!!mc, "Minecraft definition must be seeded");
        ctx.state.definitionId = mc.id;
      });

      await step("server is created", async () => {
        const res = await admin.post("/api/servers", {
          name: "E2E Vanilla MC",
          definitionId: ctx.state.definitionId,
          ramAllocation: 2,
        });
        expect(res.status === 201, `create → ${res.status}: ${res.text.slice(0, 300)}`);
        expect(res.body?.status === "STOPPED", `new server status → ${res.body?.status}, want STOPPED`);
        expect(res.body?.port === 25565, `new server port → ${res.body?.port}, want 25565`);
        expect(res.body?.game === "MINECRAFT", `new server game → ${res.body?.game}`);
        serverId = res.body.id;
        ctx.state.serverId = serverId;
        serverPort = res.body.port;
      });

      await step("start accepts and begins provisioning", async () => {
        const res = await admin.post(`/api/servers/${serverId}/start`);
        expect(res.status === 200, `start → ${res.status}: ${res.text.slice(0, 300)}`);
        expect(
          ["STARTING", "RUNNING"].includes(res.body?.status),
          `start response status → ${res.body?.status}, want STARTING/RUNNING`
        );
      });

      const bootT0 = Date.now();
      await step("server reaches RUNNING only when the port truly accepts", async () => {
        const seen = new Set<string>();
        const server = await pollUntil(
          () => getServer(admin, serverId),
          (s) => s?.status === "RUNNING" || s?.status === "CRASHED" || s?.status === "STOPPED",
          BOOT_TIMEOUT_MS,
          3000,
          async (s) => {
            if (!s) return;
            if (!seen.has(s.status)) {
              seen.add(s.status);
              console.log(`      status → ${s.status}`);
            }
          }
        );
        expect(
          server?.status === "RUNNING",
          `terminal status → ${server?.status ?? "none"} (statuses seen: ${Array.from(seen).join(",")}); check app output and server.log`
        );
        const bootSeconds = Math.round((Date.now() - bootT0) / 1000);
        console.log(`      boot wall time: ${bootSeconds}s`);
      });

      await step("game port accepts TCP connections", async () => {
        expect(await tcpAccepts(serverPort), `port ${serverPort} must accept after RUNNING`);
      });

      await step("query returns the live game status", async () => {
        // RUNNING flips on TCP-accept, which vanilla MC does slightly before
        // its status-ping handler is live — give the query a short window.
        const res = await pollUntil(
          () => admin.get(`/api/servers/${serverId}/query`),
          (r) => r.status === 200 && r.body?.status === "online",
          90_000,
          3000
        );
        expect(res.status === 200, `query → ${res.status}: ${res.text.slice(0, 200)}`);
        expect(
          res.body?.status === "online",
          `query status → ${res.body?.status}${res.body?.error ? ` (${res.body.error})` : ""}, want online`
        );
        expect(res.body?.maxplayers >= 1, `query maxplayers → ${res.body?.maxplayers}`);
        expect(typeof res.body?.players === "number", `query players count type → ${typeof res.body?.players}`);
        expect(Array.isArray(res.body?.playerList), "query playerList is an array");
      });

      await step("console accepts a command", async () => {
        const res = await admin.post(`/api/servers/${serverId}/console`, { command: "list" });
        expect(res.status === 200 && res.body?.success === true, `console list → ${res.status}: ${res.text.slice(0, 200)}`);
      });

      await step("logs show the boot Done line and the command output", async () => {
        await sleep(2000); // give the game a beat to flush the command response
        const res = await admin.get(`/api/servers/${serverId}/logs`);
        expect(res.status === 200, `logs → ${res.status}`);
        const text = res.body?.logs ?? res.body?.lines ?? res.body?.content ?? "";
        expect(/Done \(\d/.test(String(text)), "server.log tail must contain the boot Done line");
        expect(/players online/.test(String(text)), "server.log tail must contain the `list` command output");
      });

      await step("log stream is a live SSE endpoint", async () => {
        const controller = new AbortController();
        try {
          const res = await fetch(`${APP_BASE_URL}/api/servers/${serverId}/logs/stream`, {
            headers: { cookie: admin.cookie() },
            signal: controller.signal,
          });
          expect(res.status === 200, `logs/stream → ${res.status}`);
          expect(
            (res.headers.get("content-type") || "").includes("text/event-stream"),
            `content-type → ${res.headers.get("content-type")}`
          );
          const reader = res.body!.getReader();
          const first = await Promise.race([
            reader.read(),
            sleep(15_000).then(() => null),
          ]);
          expect(!!first?.value, "SSE stream must deliver bytes");
          controller.abort();
        } catch (err: any) {
          if (!/abort/i.test(String(err.message))) throw err;
        }
      });

      await step("stats family responds with real shapes", async () => {
        const stats = await admin.get(`/api/servers/${serverId}/stats`);
        expect(stats.status === 200, `GET stats → ${stats.status}`);
        for (const key of ["cpu", "memory", "currentCpu", "currentMemory"]) {
          expect(key in (stats.body ?? {}), `stats response must carry ${key}`);
        }
        for (const pathName of ["telemetry", "disk", "players", "network-status", "crashes", "sessions", "progress"]) {
          const res = await admin.get(`/api/servers/${serverId}/${pathName}`);
          expect(res.status === 200, `GET ${pathName} → ${res.status}: ${res.text.slice(0, 160)}`);
        }
      });

      await step("restart cycles through to RUNNING again", async () => {
        const res = await admin.post(`/api/servers/${serverId}/restart`);
        expect(res.status === 200 || res.status === 202, `restart → ${res.status}: ${res.text.slice(0, 200)}`);
        const server = await pollUntil(
          () => getServer(admin, serverId),
          (s) => s?.status === "RUNNING",
          BOOT_TIMEOUT_MS,
          3000
        );
        expect(server?.status === "RUNNING", `status after restart → ${server?.status}`);
      });

      await step("stop takes the process and port down", async () => {
        const res = await admin.post(`/api/servers/${serverId}/stop`);
        expect(res.status === 200, `stop → ${res.status}: ${res.text.slice(0, 200)}`);
        const server = await pollUntil(() => getServer(admin, serverId), (s) => s?.status === "STOPPED", 60_000, 2000);
        expect(server?.status === "STOPPED", `status after stop → ${server?.status}`);
        await sleep(1500);
        expect(!(await tcpAccepts(serverPort)), `port ${serverPort} must be closed after stop`);
      });

      await step("a killed boot never lies about readiness", async () => {
        const start = await admin.post(`/api/servers/${serverId}/start`);
        expect(start.status === 200, `start → ${start.status}`);
        const server = await pollUntil(
          () => getServer(admin, serverId),
          (s) => !!s?.pid,
          120_000,
          1000
        );
        expect(!!server?.pid, "server row must expose a pid while booting");
        try {
          process.kill(server.pid, "SIGKILL");
        } catch (err: any) {
          throw new Error(`could not SIGKILL the booting server (pid ${server.pid}): ${err.message}`);
        }
        const terminal = await pollUntil(
          () => getServer(admin, serverId),
          (s) => ["CRASHED", "STOPPED"].includes(s?.status),
          120_000,
          2000
        );
        expect(
          terminal?.status === "CRASHED" || terminal?.status === "STOPPED",
          `status after kill → ${terminal?.status}, want CRASHED/STOPPED (never RUNNING)`
        );
      });

      await step("archive moves the server into the vault", async () => {
        const res = await admin.post(`/api/servers/${serverId}/archive`);
        expect(res.status === 200, `archive → ${res.status}: ${res.text.slice(0, 300)}`);
        const archiveId = res.body?.id;
        expect(!!archiveId, "archive response carries the archive id");
        expect(
          !fs.existsSync(path.join(DATA_DIR, "local-servers", serverId)),
          "server dir must leave local-servers after archiving"
        );
        expect(
          fs.existsSync(path.join(DATA_DIR, "local-archives", archiveId)),
          "archive dir must exist in local-archives"
        );
        const list = await admin.get("/api/servers");
        expect(
          (list.body?.archives ?? []).some((a: any) => a.id === archiveId),
          "archived row appears in the dashboard payload"
        );
        ctx.state.archiveId = archiveId;
      });

      await step("restore brings the server back to the dashboard", async () => {
        const archiveId = ctx.state.archiveId as string;
        const res = await admin.post(`/api/archives/${archiveId}/restore`);
        expect(res.status === 200, `restore → ${res.status}: ${res.text.slice(0, 300)}`);
        const restoredId = res.body?.id;
        expect(!!restoredId, "restore response carries the new server id");
        const server = await pollUntil(
          () => getServer(admin, restoredId),
          (s) => !!s,
          30_000,
          1000
        );
        expect(!!server, "restored server appears in the list");
        expect(
          fs.existsSync(path.join(DATA_DIR, "local-servers", restoredId)),
          "restored server dir is back in local-servers"
        );
      });

      await step("a non-member cannot touch the owner's server", async () => {
        const member = new ApiClient(APP_BASE_URL);
        const login = await member.post("/api/auth/login", MEMBER_USER_AFTER_ROTATION);
        expect(login.status === 200, `member login → ${login.status}`);
        const res = await member.get(`/api/servers/${serverId}/secrets`);
        expect(res.status === 403, `member secrets access → ${res.status}, want 403`);
      });
    }
  ),
];
