/**
 * Nodes + agents end-to-end (PR-C): the harness plays the node over the real
 * HMAC protocol — enroll → register → sync handshake → command claim → result
 * report → the raw upload/download transfers → revocation. No agent binary and
 * no Docker involved: the two long-running dashboard flows that reach the node
 * (backup create and restore) block on the agent's result, and the harness
 * services them concurrently like a real node would.
 *
 * Server assignment is a documented DB fixture: creating an AGENT server via
 * POST /api/servers requires a definition with a container plan, which no
 * builtin provides — the routes under test only read runnerType + nodeId.
 */

import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { ApiClient, expect } from "../client";
import { scenario, step, sleep, type ScenarioContext } from "./framework";
import { serverDir, memberClient } from "./surface";
import { prisma } from "../dbFixture";

interface NodeCreds {
  nodeId: string;
  nodeSecret: string;
}

function signSync(nodeSecret: string, nodeId: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac("sha256", nodeSecret).update(`${nodeId}\n${timestamp}\n${rawBody}`).digest("hex");
}

function signPath(nodeSecret: string, nodeId: string, timestamp: string, method: string, path: string): string {
  return crypto.createHmac("sha256", nodeSecret).update(`${nodeId}\n${timestamp}\n${method}\n${path}`).digest("hex");
}

function nodeHeaders(creds: NodeCreds, body: string): Record<string, string> {
  const timestamp = String(Date.now());
  return {
    "x-node-id": creds.nodeId,
    "x-node-timestamp": timestamp,
    "x-node-signature": signSync(creds.nodeSecret, creds.nodeId, timestamp, body),
    "content-type": "application/json",
  };
}

async function agentSync(client: ApiClient, creds: NodeCreds, body: unknown) {
  const raw = JSON.stringify(body);
  const res = await fetch(`${client.baseUrl}/api/agents/sync`, {
    method: "POST",
    headers: nodeHeaders(creds, raw),
    body: raw,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed, text, respSignature: res.headers.get("x-node-resp-signature") };
}

async function agentPathRequest(
  client: ApiClient,
  creds: NodeCreds,
  method: "POST" | "GET",
  pathWithQuery: string,
  signQuery: boolean,
  body?: Buffer
) {
  const timestamp = String(Date.now());
  const signedPath = signQuery ? pathWithQuery : pathWithQuery.split("?")[0];
  const res = await fetch(`${client.baseUrl}${pathWithQuery}`, {
    method,
    headers: {
      "x-node-id": creds.nodeId,
      "x-node-timestamp": timestamp,
      "x-node-signature": signPath(creds.nodeSecret, creds.nodeId, timestamp, method, signedPath),
    },
    body: body ? new Uint8Array(body) : undefined,
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  const text = bytes.toString("utf8");
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null; // binary transfers stay as bytes
  }
  return { status: res.status, body: parsed, headers: res.headers, bytes };
}

export const agentScenarios = [
  scenario(
    "agents/nodes-lifecycle",
    "node enroll/register, HMAC sync handshake, command claim+result, raw upload/download, revoke",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const member = await memberClient(ctx);

      let nodeId = "";
      let enrollToken = "";
      await step("nodes: admin mints an enrollment token, non-admin denied", async () => {
        const unauth = await fetch(`${admin.baseUrl}/api/nodes`);
        expect(unauth.status === 401, `unauth GET nodes → ${unauth.status}, want 401`);
        const forbidden = await member.post("/api/nodes", { name: "e2e-member-node" });
        expect(forbidden.status === 403, `member POST node → ${forbidden.status}, want 403`);
        const badName = await admin.post("/api/nodes", { name: "" });
        expect(badName.status === 400, `empty name → ${badName.status}, want 400`);

        const res = await admin.post("/api/nodes", { name: "e2e-node" });
        expect(res.status === 200, `POST node → ${res.status}: ${res.text.slice(0, 200)}`);
        nodeId = res.body?.node?.id;
        enrollToken = res.body?.enrollToken;
        expect(/^[0-9a-f]{32}$/.test(enrollToken), `enrollToken shape → ${enrollToken}`);
        expect(res.body?.node?.status === "PENDING", "node starts PENDING");

        const list = await admin.get("/api/nodes");
        const row = (list.body?.nodes ?? []).find((n: any) => n.id === nodeId);
        expect(!!row && row.status === "PENDING", "node listed while pending");
        expect(row?.enroll?.token === enrollToken, "GET re-serves the token to admins while PENDING");
      });

      const creds: NodeCreds = { nodeId, nodeSecret: "" };
      await step("register: token is single-use and wrong tokens are refused", async () => {
        const bad = await admin.post("/api/agents/register", { token: "f".repeat(32) });
        expect(bad.status === 401, `wrong token → ${bad.status}, want 401`);

        const res = await admin.post("/api/agents/register", { token: enrollToken });
        expect(res.status === 200, `register → ${res.status}: ${res.text.slice(0, 200)}`);
        creds.nodeSecret = res.body?.nodeSecret;
        expect(res.body?.nodeId === nodeId, "register returns the node id");
        expect(/^[0-9a-f]{32}$/.test(creds.nodeSecret), "128-bit node secret issued");
        expect(res.body?.protocolVersion === 1, "protocol v1");

        const reuse = await admin.post("/api/agents/register", { token: enrollToken });
        expect(reuse.status === 401, `token reuse → ${reuse.status}, want 401`);
      });

      await step("sync handshake: every auth failure mode is explicit", async () => {
        const noHeaders = await fetch(`${admin.baseUrl}/api/agents/sync`, { method: "POST", body: "{}" });
        expect(noHeaders.status === 401, `no headers → ${noHeaders.status}`);

        const ts = String(Date.now());
        const raw = JSON.stringify({ protocolVersion: 1 });
        const badSig = await fetch(`${admin.baseUrl}/api/agents/sync`, {
          method: "POST",
          headers: {
            "x-node-id": creds.nodeId,
            "x-node-timestamp": ts,
            "x-node-signature": "0".repeat(64),
            "content-type": "application/json",
          },
          body: raw,
        });
        expect(badSig.status === 401, `bad signature → ${badSig.status}, want 401`);

        const stale = String(Date.now() - 6 * 60 * 1000);
        const staleRes = await fetch(`${admin.baseUrl}/api/agents/sync`, {
          method: "POST",
          headers: {
            "x-node-id": creds.nodeId,
            "x-node-timestamp": stale,
            "x-node-signature": signSync(creds.nodeSecret, creds.nodeId, stale, raw),
            "content-type": "application/json",
          },
          body: raw,
        });
        expect(staleRes.status === 401, `stale timestamp → ${staleRes.status}, want 401`);

        const futureVersion = await agentSync(admin, creds, { protocolVersion: 2, results: [], servers: [] });
        expect(futureVersion.status === 400, `protocolVersion 2 → ${futureVersion.status}, want 400`);
      });

      let agentServerId = "";
      let tarPath = "";
      await step("agent server fixture: assign a server to the node via the throwaway DB", async () => {
        const res = await admin.post("/api/servers", {
          name: "E2E Agent Server", definitionId: ctx.state.definitionId as string, ramAllocation: 2,
        });
        expect(res.status === 200 || res.status === 201, `create → ${res.status}`);
        agentServerId = res.body?.server?.id ?? res.body?.id;
        ctx.state.agentServerId = agentServerId;

        // Documented fixture: no builtin definition ships a container plan, so
        // the API path can't create AGENT servers; the routes under test read
        // exactly these two columns. lastSeenAt replicates the heartbeat every
        // real sync performs — resolveUsableNode refuses offline nodes.
        await prisma.server.update({
          where: { id: agentServerId },
          data: { runnerType: "AGENT", nodeId },
        });
        await prisma.agentNode.update({
          where: { id: nodeId },
          data: { lastSeenAt: new Date() },
        });

        fs.mkdirSync(path.join(serverDir(agentServerId), "world"), { recursive: true });
        fs.writeFileSync(path.join(serverDir(agentServerId), "world", "level.dat"), "agent world data");
        tarPath = path.join(os.tmpdir(), `rs-e2e-agent-backup-${Date.now()}.tar`);
        execFileSync("tar", ["-cf", tarPath, "-C", serverDir(agentServerId), "world"]);
      });

      let backupId = "";
      await step("backup create: dashboard blocks while the node claims, uploads, and reports", async () => {
        // Raw-transfer guards first (no command needed).
        const empty = await agentPathRequest(admin, creds, "POST", `/api/agents/upload?serverId=${agentServerId}`, true, Buffer.alloc(0));
        expect(empty.status === 400 && empty.body?.error === "Empty upload.", `empty upload → ${empty.status}`);
        const foreign = await agentPathRequest(admin, creds, "POST", `/api/agents/upload?serverId=${ctx.state.surfaceServerId as string}`, true, Buffer.from("junk"));
        expect(foreign.status === 403, `foreign server upload → ${foreign.status}, want 403`);
        const ts = String(Date.now());
        const unsigned = await fetch(`${admin.baseUrl}/api/agents/upload?serverId=${agentServerId}`, {
          method: "POST", headers: { "x-node-id": creds.nodeId, "x-node-timestamp": ts, "x-node-signature": "0".repeat(64) }, body: "junk",
        });
        expect(unsigned.status === 401, `bad signature upload → ${unsigned.status}, want 401`);

        const tar = fs.readFileSync(tarPath);
        const backupPromise = admin.post(`/api/servers/${agentServerId}/backups`, {});
        // If the route finishes before the first sync, it failed before
        // enqueueing — surface its status instead of timing out the claim.
        let early: any = null;
        const winner = await Promise.race([
          backupPromise.then((r) => ((early = r), "done")),
          sleep(2500).then(() => "waiting"),
        ]);
        expect(winner === "waiting" || early?.status === 201, `backup POST ended early → ${early?.status}: ${early?.text?.slice(0, 200)}`);

        const claim = await agentSync(admin, creds, { protocolVersion: 1, results: [], servers: [] });
        expect(claim.status === 200, `claim sync → ${claim.status}: ${claim.text.slice(0, 200)}`);
        expect(typeof claim.respSignature === "string", "response carries x-node-resp-signature");
        const expectedSig = crypto.createHmac("sha256", creds.nodeSecret).update(claim.text).digest("hex");
        expect(claim.respSignature === expectedSig, "response signature verifies over the exact body");
        expect(JSON.stringify(claim.body?.assignedServers ?? []).includes(agentServerId), "assignedServers includes the agent server");

        const command = (claim.body?.commands ?? [])[0];
        expect(!!command, "BACKUP_CREATE command claimed");
        expect(command.type === "BACKUP_CREATE" && command.serverId === agentServerId, `command → ${command.type} for ${command.serverId}`);
        expect(command.payload?.kind === "BACKUP_CREATE" && !!command.payload?.uploadPath, "payload carries kind + uploadPath");

        const upload = await agentPathRequest(admin, creds, "POST", command.payload.uploadPath, true, tar);
        expect(upload.status === 200, `upload → ${upload.status}: ${upload.bytes.toString("utf8").slice(0, 200)}`);
        const uploadId = upload.body?.uploadId;
        expect(/^[0-9a-f]{32}$/.test(uploadId), `uploadId shape → ${uploadId}`);
        expect(upload.body?.sizeBytes === tar.length, "sizeBytes matches the tar");

        const report = await agentSync(admin, creds, {
          protocolVersion: 1,
          results: [{ commandId: command.id, ok: true, output: JSON.stringify({ uploadId }) }],
          servers: [],
        });
        expect(report.status === 200, `report sync → ${report.status}`);

        const created = await backupPromise;
        expect(created.status === 201, `backup create resolves → ${created.status}: ${created.text.slice(0, 200)}`);
        backupId = created.body?.id;
        expect(!!backupId, "backup row created from the agent upload");
        const list = await admin.get(`/api/servers/${agentServerId}/backups`);
        expect((list.body ?? []).some((b: any) => b.id === backupId), "backup listed on the agent server");
      });

      await step("backup restore: one-shot download token, signed transfer, result completion", async () => {
        await prisma.agentNode.update({ where: { id: nodeId }, data: { lastSeenAt: new Date() } });
        const restorePromise = admin.post(`/api/backups/${backupId}/restore`, {});

        const claim = await agentSync(admin, creds, { protocolVersion: 1, results: [], servers: [] });
        const command = (claim.body?.commands ?? [])[0];
        expect(!!command && command.type === "BACKUP_RESTORE", `command → ${command?.type}`);
        const downloadPath = String(command.payload?.downloadPath ?? "");
        expect(downloadPath.startsWith("/api/agents/download/") && downloadPath.includes("serverId="), `downloadPath → ${downloadPath}`);

        // The route signs the token path WITHOUT the query string (the upload
        // route signs WITH it) — a real agent that signs the full path gets
        // 401. Both behaviors are pinned here.
        const withQuery = await agentPathRequest(admin, creds, "GET", downloadPath, true);
        expect(withQuery.status === 401 && String(withQuery.body?.error || "").includes("bad_signature"), `signed-with-query → ${withQuery.status}: ${withQuery.body?.error}`);
        const wrongServer = await agentPathRequest(admin, creds, "GET", downloadPath.replace(/serverId=[^&]+/, `serverId=${ctx.state.surfaceServerId as string}`), false);
        expect(wrongServer.status === 404, `wrong-server query → ${wrongServer.status}, want 404 (token bound to server)`);
        const download = await agentPathRequest(admin, creds, "GET", downloadPath, false);
        expect(download.status === 200, `download → ${download.status}: ${download.bytes.length} bytes`);
        expect((download.headers.get("content-type") || "").includes("application/x-tar"), "tar content type");
        expect(download.bytes.length > 0, "non-empty tar delivered");
        const reuse = await agentPathRequest(admin, creds, "GET", downloadPath, false);
        expect(reuse.status === 404, `token reuse → ${reuse.status}, want 404 (single-use)`);

        const report = await agentSync(admin, creds, {
          protocolVersion: 1,
          results: [{ commandId: command.id, ok: true, output: JSON.stringify({ ok: true }) }],
          servers: [],
        });
        expect(report.status === 200, `report sync → ${report.status}`);

        const restored = await restorePromise;
        expect(restored.status === 200 && restored.body?.success === true, `restore resolves → ${restored.status}: ${restored.text.slice(0, 200)}`);
      });

      await step("server-state sync: agent-reported status lands on the row", async () => {
        const res = await agentSync(admin, creds, {
          protocolVersion: 1, results: [],
          servers: [{ serverId: agentServerId, status: "RUNNING", cpuPercent: 4.2, memoryMB: 128, started: true }],
        });
        expect(res.status === 200, `state sync → ${res.status}`);
        const list = await admin.get("/api/servers");
        const row = (list.body?.servers ?? []).find((s: any) => s.id === agentServerId);
        expect(row?.status === "RUNNING", `agent-reported status → ${row?.status}, want RUNNING`);

        const stop = await agentSync(admin, creds, {
          protocolVersion: 1, results: [],
          servers: [{ serverId: agentServerId, status: "STOPPED" }],
        });
        expect(stop.status === 200, "stop report accepted");
        await prisma.server.update({ where: { id: agentServerId }, data: { status: "STOPPED" } });
      });

      await step("revoke: node dies, sync refuses, servers crash-listed", async () => {
        const res = await admin.delete(`/api/nodes/${nodeId}`);
        expect(res.status === 200 && res.body?.revoked === true, `revoke → ${res.status}`);
        expect(res.body?.serversAffected >= 1, `serversAffected → ${res.body?.serversAffected}`);

        const dead = await agentSync(admin, creds, { protocolVersion: 1, results: [], servers: [] });
        expect(dead.status === 401, `sync after revoke → ${dead.status}, want 401`);

        const list = await admin.get("/api/nodes");
        const row = (list.body?.nodes ?? []).find((n: any) => n.id === nodeId);
        expect(!!row && row.status === "REVOKED" && row.online === false, "node listed as revoked and offline");

        fs.rmSync(tarPath, { force: true });
      });
    }
  ),
];
