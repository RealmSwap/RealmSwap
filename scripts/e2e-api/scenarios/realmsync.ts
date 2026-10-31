/**
 * RealmSync end-to-end (PR-C): the owner starts the invite host over the real
 * route (public IP + port 3001 listener + UPnP attempt), the harness then acts
 * as the client — verifying the signed manifest directly against the listener,
 * joining through /api/client/sync with a non-loopback host, streaming the SSE
 * progress, and receiving the config payload on disk.
 *
 * The only network dependency is the ipify lookup the invite route performs.
 * No Thunderstore mods are in the manifest (vanilla server), so the client sync
 * is fully offline apart from that.
 */

import crypto from "crypto";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { expect } from "../client";
import { scenario, step, sleep, type ScenarioContext } from "./framework";
import { serverDir, memberClient } from "./surface";

/** RealmSync auth token: HMAC-SHA256(secret.toUpperCase(), "METHOD\n/path"). */
function syncAuthToken(secret: string, method: string, pathname: string): string {
  return crypto.createHmac("sha256", secret.toUpperCase()).update(`${method.toUpperCase()}\n${pathname}`).digest("hex");
}

function lanAddress(): { ip: string; port: number } | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return { ip: iface.address, port: 3001 };
    }
  }
  return null;
}

async function portClosed(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port, timeout: 1500 });
    socket.on("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(true));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export const realmsyncScenarios = [
  scenario(
    "realmsync/host-client-sync",
    "invite host, signed manifest on :3001, client sync round-trip, SSE progress, revoke",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const serverId = ctx.state.surfaceServerId as string;
      const member = await memberClient(ctx);
      // Seed the config payload before anything fetches it — the host tars the
      // server's config/ dir at request time and the client extracts it.
      seedRealmSyncConfig(serverId);

      let codeId = "";
      let secret = "";
      let host = "";
      await step("invite: non-owner denied; owner mints the code and starts the host", async () => {
        const denied = await member.post(`/api/servers/${serverId}/invite`);
        expect(denied.status === 404, `member invite → ${denied.status}, want 404`);

        const res = await admin.post(`/api/servers/${serverId}/invite`);
        expect(res.status === 200, `invite → ${res.status}: ${res.text.slice(0, 200)}`);
        const inviteCode = String(res.body?.inviteCode ?? "");
        const match = /^(\d+\.\d+\.\d+\.\d+):(\d+)\/([0-9A-F]{40})$/.exec(inviteCode);
        expect(!!match, `inviteCode shape → ${inviteCode}`);
        host = `${match![1]}:${match![2]}`;
        const combined = match![3];
        codeId = combined.slice(0, 8);
        secret = combined.slice(8);
        expect(typeof res.body?.syncMappingOk === "boolean", "syncMappingOk reported (UPnP attempt)");

        // The code is persisted on the server row.
        const row = await admin.get(`/api/servers`);
        const mine = (row.body?.servers ?? []).find((s: any) => s.id === serverId);
        expect(!!mine, "server still listed");
      });

      const manifestPath = `/sync/${codeId}/manifest`;
      await step("host listener: signed manifest, tamper and unknown-code refusals", async () => {
        const token = syncAuthToken(secret, "GET", manifestPath);
        const res = await fetch(`http://127.0.0.1:3001${manifestPath}`, {
          headers: { authorization: `RealmSync ${token}` },
        });
        expect(res.status === 200, `manifest → ${res.status}`);
        expect(!!res.headers.get("x-realmsync-signature"), "response carries the integrity signature");
        const manifest = await res.json();
        expect(manifest?.protocolVersion === 2, "protocol v2");
        expect(manifest?.serverName === "E2E Surface Server", `serverName → ${manifest?.serverName}`);
        expect(manifest?.game === "MINECRAFT", `game → ${manifest?.game}`);
        expect(Array.isArray(manifest?.mods) && manifest.mods.length === 0, "vanilla manifest has no mods");
        expect(manifest?.configDownloadUrl === `/sync/${codeId}/configs`, "config URL points at the same code");

        const tampered = await fetch(`http://127.0.0.1:3001${manifestPath}`, {
          headers: { authorization: `RealmSync ${syncAuthToken("0".repeat(32), "GET", manifestPath)}` },
        });
        expect(tampered.status === 401, `wrong secret → ${tampered.status}, want 401`);
        const unknownPath = `/sync/DEADBEEF/manifest`;
        const unknown = await fetch(`http://127.0.0.1:3001${unknownPath}`, {
          headers: { authorization: `RealmSync ${syncAuthToken(secret, "GET", unknownPath)}` },
        });
        expect(unknown.status === 404, `unknown codeId → ${unknown.status}, want 404`);
      });

      await step("client sync: blocked loopback, bad payload, then the real join", async () => {
        const gamePath = "/tmp/realmswap-e2e-game";
        fs.rmSync(gamePath, { recursive: true, force: true });
        fs.mkdirSync(gamePath, { recursive: true });

        const loopback = await admin.post("/api/client/sync", { host: "127.0.0.1:3001", codeId, secret, gamePath });
        expect(loopback.status === 400, `loopback host → ${loopback.status}, want 400 (SSRF guard)`);
        const badCode = await admin.post("/api/client/sync", { host, codeId: "xyz", secret, gamePath });
        expect(badCode.status === 400, `bad codeId → ${badCode.status}, want 400`);

        const lan = lanAddress();
        expect(!!lan, "a non-loopback IPv4 interface is required for the client-side host check");
        const joinHost = `${lan!.ip}:3001`;
        const join = await admin.post("/api/client/sync", { host: joinHost, codeId, secret, gamePath });
        expect(join.status === 200, `client sync → ${join.status}: ${join.text.slice(0, 300)}`);
        const taskId = String(join.body?.taskId ?? "");
        expect(/^[0-9a-f]{16}$/.test(taskId), `taskId shape → ${taskId}`);

        const dedupe = await admin.post("/api/client/sync", { host: joinHost, codeId, secret, gamePath });
        expect(dedupe.status === 200 && dedupe.body?.taskId === taskId, "identical running task is deduped");

        // SSE progress stream (cookie-authed), resolved by the done frame.
        const events: any[] = [];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60_000);
        try {
          const res = await fetch(`${admin.baseUrl}/api/client/sync/progress?taskId=${taskId}`, {
            headers: { cookie: admin.cookie() },
            signal: controller.signal,
          });
          expect(res.status === 200, `progress → ${res.status}`);
          expect((res.headers.get("content-type") || "").includes("text/event-stream"), "progress is SSE");
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let sep: number;
            while ((sep = buf.indexOf("\n\n")) >= 0) {
              const block = buf.slice(0, sep);
              buf = buf.slice(sep + 2);
              const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
              if (!dataLine) continue;
              try {
                events.push(JSON.parse(dataLine.slice(5).trim()));
              } catch {
                /* ignore partial frames */
              }
            }
            const last = events.at(-1);
            if (last && (last.done || last.error)) break;
          }
        } finally {
          clearTimeout(timer);
          controller.abort();
        }
        const final = events.at(-1);
        expect(!!final && final.done === true && final.error === null, `final progress → ${JSON.stringify(final)}`);
        expect(final.percent === 100, "percent reaches 100");
        expect(fs.existsSync(path.join(gamePath, "config")), "config dir extracted into the game path");

        const missingTask = await admin.get("/api/client/sync/progress?taskId=nope");
        expect(missingTask.status === 404, `unknown task → ${missingTask.status}, want 404`);
        const noTask = await admin.get("/api/client/sync/progress");
        expect(noTask.status === 400, `missing taskId → ${noTask.status}, want 400`);

        // One wrong-secret attempt (failure limiter allows 10/min per IP).
        const wrong = await admin.post("/api/client/sync", { host: joinHost, codeId, secret: "F".repeat(32), gamePath });
        expect(wrong.status === 500, `wrong secret → ${wrong.status}, want 500 (host rejected)`);
        expect(String(wrong.body?.error || "").includes("rejected this invite"), `error → ${wrong.body?.error}`);
      });

      await step("the synced payload landed intact", async () => {
        const marker = path.join("/tmp/realmswap-e2e-game", "config", "e2e-marker.properties");
        expect(fs.existsSync(marker), `marker exists → ${marker}`);
        expect(fs.readFileSync(marker, "utf8").includes("synced-by-e2e"), "marker content round-tripped");
      });

      await step("revoke: invite deleted, host listener stops, client re-sync 500s", async () => {
        const res = await admin.delete(`/api/servers/${serverId}/invite`);
        expect(res.status === 204, `DELETE invite → ${res.status}, want 204`);
        const again = await admin.delete(`/api/servers/${serverId}/invite`);
        expect(again.status === 204, "second delete is idempotent");

        await sleep(500);
        expect(await portClosed(3001), "port 3001 closed after the last invite was revoked");

        const lan = lanAddress();
        const rejected = await admin.post("/api/client/sync", { host: `${lan!.ip}:3001`, codeId, secret, gamePath: "/tmp/realmswap-e2e-game" });
        expect(rejected.status === 500, `sync against stopped host → ${rejected.status}, want 500`);
      });
    }
  ),
];

// The config payload is seeded before the invite step runs; the sync's tar
// fetch carries it to the client. (Kept as an exported helper so the ordering
// contract is documented next to the assertion that consumes it.)
export function seedRealmSyncConfig(serverId: string): void {
  const configDir = path.join(serverDir(serverId), "config");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "e2e-marker.properties"), "# synced-by-e2e\n");
}
