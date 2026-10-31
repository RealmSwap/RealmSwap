/**
 * Membership + players + definitions + RCON (PR-C): collaborator CRUD and the
 * role ladder, host-link/transfer (honest SFTP failure against a closed
 * local port), the global players book + whitelist file sync, custom
 * definition lifecycle, and the RCON routes (auth ladder + the no-credentials
 * null-result contract).
 */

import fs from "fs";
import path from "path";
import { expect } from "../client";
import { scenario, step, type ScenarioContext } from "./framework";
import { serverDir, memberClient } from "./surface";
import { prisma } from "../dbFixture";

export const membershipScenarios = [
  scenario(
    "surface/membership-players",
    "collaborators/host-link/transfer/players+sync/definitions CRUD/rcon",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const serverId = ctx.state.surfaceServerId as string;
      const definitionId = ctx.state.definitionId as string;
      const member = await memberClient(ctx);
      const memberEmail = (ctx.state.memberEmail as string) || "e2e-member@realmswap.test";

      let collaboratorUserId = "";
      await step("collaborators: owner-only management, role ladder, duplicate/self/unknown rejection", async () => {
        const denied = await member.get(`/api/servers/${serverId}/collaborators`);
        expect(denied.status === 404, `non-member list → ${denied.status}, want 404`);

        const invite = await admin.post(`/api/servers/${serverId}/collaborators`, { email: memberEmail, role: "MODERATOR" });
        expect(invite.status === 201, `POST collaborator → ${invite.status}: ${invite.text.slice(0, 200)}`);
        collaboratorUserId = invite.body?.userId ?? invite.body?.user?.id;
        expect(!!collaboratorUserId, "created row carries the user id");

        const dup = await admin.post(`/api/servers/${serverId}/collaborators`, { email: memberEmail, role: "VIEWER" });
        expect(dup.status === 400, `duplicate → ${dup.status}, want 400`);
        const unknown = await admin.post(`/api/servers/${serverId}/collaborators`, { email: "nobody@realmswap.test", role: "VIEWER" });
        expect(unknown.status === 404, `unknown email → ${unknown.status}, want 404`);
        const adminEmail = "e2e-admin@realmswap.test";
        const self = await admin.post(`/api/servers/${serverId}/collaborators`, { email: adminEmail, role: "VIEWER" });
        expect(self.status === 400, `self-invite → ${self.status}, want 400`);

        const list = await admin.get(`/api/servers/${serverId}/collaborators`);
        expect(list.status === 200 && (list.body ?? []).length === 1, "list shows the one collaborator");

        // Even a server MODERATOR is locked out of owner config (ADMIN server-role).
        const memberConfig = await member.get(`/api/servers/${serverId}/config`);
        expect(memberConfig.status === 404, `MODERATOR GET config → ${memberConfig.status}, want 404 (ADMIN server-role)`);
        const memberPut = await member.put(`/api/servers/${serverId}/config`, { content: "motd=hijack\n" });
        expect(memberPut.status === 403, `MODERATOR PUT config → ${memberPut.status}, want 403 (ADMIN required)`);

        const demote = await admin.put(`/api/servers/${serverId}/collaborators`, { userId: collaboratorUserId, role: "VIEWER" });
        expect(demote.status === 200, `PUT role → ${demote.status}`);
        const restore = await admin.put(`/api/servers/${serverId}/collaborators`, { userId: collaboratorUserId, role: "MODERATOR" });
        expect(restore.status === 200, "role restored to MODERATOR");

        const noUser = await admin.delete(`/api/servers/${serverId}/collaborators`, {});
        expect(noUser.status === 400, `DELETE without userId → ${noUser.status}, want 400`);
        const revoke = await admin.delete(`/api/servers/${serverId}/collaborators`, { userId: collaboratorUserId });
        expect(revoke.status === 200 && revoke.body?.success === true, "collaborator revoked");
        const afterRevoke = await member.get(`/api/servers/${serverId}/collaborators`);
        expect(afterRevoke.status === 404, "stranger again after revoke");
      });

      await step("host-link: shape-only validation, encrypted storage, honest dead-endpoint test", async () => {
        const empty = await admin.get(`/api/servers/${serverId}/host-link`);
        expect(empty.status === 200 && empty.body?.link === null, "no host link initially");
        const memberDenied = await member.put(`/api/servers/${serverId}/host-link`, {
          host: "h", port: 22, username: "u", password: "p",
        });
        expect(memberDenied.status === 404, `stranger PUT host-link → ${memberDenied.status}, want 404`);

        const noPassword = await admin.put(`/api/servers/${serverId}/host-link`, { host: "127.0.0.1", username: "u" });
        expect(noPassword.status === 400, `PUT without password → ${noPassword.status}, want 400`);

        const created = await admin.put(`/api/servers/${serverId}/host-link`, {
          host: "127.0.0.1", port: 2, username: "e2e", password: "e2e-secret", remoteBasePath: ".",
        });
        expect(created.status === 200 && created.body?.link?.host === "127.0.0.1", `PUT host-link → ${created.status}`);
        expect(created.body?.link?.secret === undefined, "secret is never returned");
        const updated = await admin.put(`/api/servers/${serverId}/host-link`, {
          host: "127.0.0.1", port: 2, username: "e2e", remoteBasePath: "./saves",
        });
        expect(updated.status === 200 && updated.body?.link?.remoteBasePath === "./saves", "update without password keeps the stored secret");

        // Nothing listens on 127.0.0.1:2 → the test must answer ok:false fast.
        const test = await admin.post(`/api/servers/${serverId}/host-link/test`);
        expect(test.status === 200, `test → ${test.status}`);
        expect(test.body?.ok === false, `dead endpoint test → ok:${test.body?.ok}`);
        expect(typeof test.body?.error === "string", "failure carries an error message");

        const tree = await admin.get(`/api/servers/${serverId}/transfer/tree`);
        expect(tree.status === 200, `tree PUSH → ${tree.status}: ${tree.text.slice(0, 200)}`);
        expect(JSON.stringify(tree.body?.defaultPaths) === JSON.stringify(["world"]), "MC default paths");
        expect(tree.body?.unknownGame === false, "game is known");
        const pullTree = await admin.get(`/api/servers/${serverId}/transfer/tree?direction=PULL`);
        expect(pullTree.status === 502, `tree PULL against dead endpoint → ${pullTree.status}, want 502`);

        const noConfirm = await admin.post(`/api/servers/${serverId}/transfer`, { direction: "PUSH", confirmRemoteStopped: false });
        expect(noConfirm.status === 400, `transfer without confirm → ${noConfirm.status}, want 400`);
        const badDirection = await admin.post(`/api/servers/${serverId}/transfer`, { direction: "SIDEWAYS", confirmRemoteStopped: true });
        expect(badDirection.status === 400, `bad direction → ${badDirection.status}, want 400`);
        const push = await admin.post(`/api/servers/${serverId}/transfer`, { direction: "PUSH", confirmRemoteStopped: true });
        expect(push.status === 500, `PUSH to dead endpoint → ${push.status}, want 500`);
        const after = await admin.get(`/api/servers/${serverId}/host-link`);
        expect(!!after.body?.link?.lastError, "lastError was persisted on the link");
        const memberPush = await member.post(`/api/servers/${serverId}/transfer`, { direction: "PUSH", confirmRemoteStopped: true });
        expect(memberPush.status === 404, `stranger transfer → ${memberPush.status}, want 404`);

        const removed = await admin.delete(`/api/servers/${serverId}/host-link`);
        expect(removed.status === 200 && removed.body?.ok === true, "host link deleted");
        const gone = await admin.get(`/api/servers/${serverId}/host-link`);
        expect(gone.body?.link === null, "link is gone");
        const noLink = await admin.get(`/api/servers/${serverId}/transfer/tree`);
        expect(noLink.status === 400, `tree without link → ${noLink.status}, want 400`);
      });

      await step("players: scoped book, global ban, whitelist file sync", async () => {
        const mine = await admin.get("/api/players");
        expect(mine.status === 200 && Array.isArray(mine.body), `GET players → ${mine.status}`);

        const noName = await admin.post("/api/players", { minecraftUuid: "abc" });
        expect(noName.status === 400, `POST without name → ${noName.status}, want 400`);
        const created = await admin.post("/api/players", { name: "E2EPlayer", minecraftUuid: "e2e-uuid-0001" });
        expect(created.status === 200 && created.body?.status === "TRUSTED", `POST player → ${created.status}`);
        const playerId = created.body?.id;
        expect(!!playerId, "player row has an id");

        // The member's book is disjoint; crossing rows 404s.
        const memberCreated = await member.post("/api/players", { name: "MemberPlayer" });
        expect(memberCreated.status === 200, "member can create their own player");
        const crossPatch = await admin.patch(`/api/players/${memberCreated.body?.id}`, { name: "hijack" });
        expect(crossPatch.status === 404, `cross-user PATCH → ${crossPatch.status}, want 404`);

        const ban = await admin.patch(`/api/players/${playerId}`, { isGloballyBanned: true, globalBanReason: "e2e cheating" });
        expect(ban.status === 200 && ban.body?.isGloballyBanned === true, "global ban applied");
        const audit = await prisma.playerAuditLog.findFirst({ where: { playerId, action: "GLOBAL_BAN" } });
        expect(!!audit, "GLOBAL_BAN audit row written");

        // Sync writes the Minecraft whitelist/ban JSON files into the server
        // dir. playerSync reads server.localPath — the config routes resolve
        // the same dir from the server id, but the column must be set for the
        // player sync to write, so pin it here like a real install would.
        const syncDir = serverDir(serverId);
        fs.mkdirSync(syncDir, { recursive: true });
        await prisma.server.update({ where: { id: serverId }, data: { localPath: syncDir } });
        const sync = await admin.post(`/api/players/${serverId}/sync`);
        expect(sync.status === 200 && sync.body?.success === true, `players sync → ${sync.status}`);
        expect(fs.existsSync(path.join(syncDir, "banned-players.json")), "banned-players.json written by sync");
        const banned = JSON.parse(fs.readFileSync(path.join(syncDir, "banned-players.json"), "utf8"));
        expect(
          JSON.stringify(banned).includes("e2e-uuid-0001"),
          "the globally banned player appears in banned-players.json"
        );

        const del = await admin.delete(`/api/players/${playerId}`);
        expect(del.status === 200 && del.body?.success === true, "player deleted");
        const again = await admin.delete(`/api/players/${playerId}`);
        expect(again.status === 404, `second delete → ${again.status}, want 404`);
        await member.delete(`/api/players/${memberCreated.body?.id}`);
      });

      let customDefId = "";
      let customSlug = "";
      await step("definitions: custom CRUD ladder with admin-only custom scripts", async () => {
        const list = await admin.get("/api/definitions");
        expect(list.status === 200, `GET definitions → ${list.status}`);
        expect(
          (list.body?.definitions ?? []).some((d: any) => d.slug === "MINECRAFT" && d.isBuiltIn),
          "builtin Minecraft is seeded"
        );

        const memberScript = await member.post("/api/definitions", {
          displayName: "E2E Script Game", installMethod: "CUSTOM_SCRIPT", spec: { params: [], configFiles: [], ports: [], launch: {}, install: { installScript: "echo hi" } },
        });
        expect(memberScript.status === 403, `member CUSTOM_SCRIPT → ${memberScript.status}, want 403`);

        const baseSpec = {
          params: [], configFiles: [], ports: [], defaultPort: 25590,
          install: { url: "https://example.com/e2e-game.zip", fileName: "e2e-game.zip", checkFile: "start.sh", requiredDiskGB: 1 },
          launch: { executable: "./start.sh" },
        };
        const created = await admin.post("/api/definitions", {
          displayName: "E2E Custom Game", installMethod: "DOWNLOAD", spec: baseSpec, description: "harness fixture",
        });
        expect(created.status === 201, `POST definition → ${created.status}: ${created.text.slice(0, 300)}`);
        customDefId = created.body?.id;
        customSlug = created.body?.slug;
        expect(customSlug === "e2e-custom-game", `slug → ${customSlug}`);

        const dup = await admin.post("/api/definitions", {
          displayName: "E2E Custom Game", installMethod: "DOWNLOAD", spec: baseSpec,
        });
        expect(dup.status === 201 && dup.body?.slug === "e2e-custom-game-2", "duplicate name gets a -2 slug");
        const dupId = dup.body?.id;

        const missing = await admin.post("/api/definitions", { installMethod: "DOWNLOAD", spec: baseSpec });
        expect(missing.status === 400, `POST without displayName → ${missing.status}, want 400`);
        const badSpec = await admin.post("/api/definitions", {
          displayName: "No URL", installMethod: "DOWNLOAD",
          spec: { params: [], configFiles: [], ports: [], install: { fileName: "x.zip", checkFile: "x", requiredDiskGB: 1 }, launch: { executable: "./x" } },
        });
        expect(badSpec.status === 400, `DOWNLOAD spec without url → ${badSpec.status}, want 400`);

        const get = await admin.get(`/api/definitions/${customDefId}`);
        expect(get.status === 200 && get.body?.slug === customSlug, "GET by id");
        const foreign = await member.get(`/api/definitions/${customDefId}`);
        expect(foreign.status === 404, `member GET other's definition → ${foreign.status}, want 404`);

        const renamed = await admin.put(`/api/definitions/${customDefId}`, {
          spec: baseSpec, displayName: "E2E Custom Game Renamed", recommendedRamGB: 3,
        });
        expect(renamed.status === 200 && renamed.body?.slug === customSlug, "PUT keeps the slug on rename");

        // A server referencing the definition blocks deletion with 409.
        const server = await admin.post("/api/servers", {
          name: "E2E CustomDef Server", definitionId: customDefId, ramAllocation: 1,
        });
        expect(server.status === 200 || server.status === 201, `custom-def server create → ${server.status}`);
        ctx.state.customDefServerId = server.body?.server?.id ?? server.body?.id;

        const used = await admin.delete(`/api/definitions/${customDefId}`);
        expect(used.status === 409, `DELETE referenced definition → ${used.status}, want 409`);
        const unused = await admin.delete(`/api/definitions/${dupId}`);
        expect(unused.status === 200 && unused.body?.success === true, "DELETE unused definition works");
      });

      await step("players sync refuses servers from unknown custom games", async () => {
        // Without localPath the sync silently skips (honest no-op); pin the
        // path so the unknown-game lookup is what actually runs.
        const customServerId = ctx.state.customDefServerId as string;
        await prisma.server.update({ where: { id: customServerId }, data: { localPath: serverDir(customServerId) } });
        const res = await admin.post(`/api/players/${customServerId}/sync`);
        expect(res.status === 500, `custom-game sync → ${res.status}, want 500`);
        expect(String(res.body?.error || "").includes(customSlug), `error names the missing game → ${res.body?.error}`);
      });

      await step("rcon: stopped refusal, RUNNING null-result contract, unsupported action", async () => {
        const stopped = await admin.post(`/api/servers/${serverId}/rcon/execute`, { action: "say", message: "hi" });
        expect(stopped.status === 400 && String(stopped.body?.error || "").includes("not running"), "stopped server refuses RCON");
        const stoppedPlayers = await admin.get(`/api/servers/${serverId}/rcon/players`);
        expect(stoppedPlayers.status === 200 && JSON.stringify(stoppedPlayers.body?.players) === "[]", "players list is [] while stopped");
        const memberExec = await member.post(`/api/servers/${serverId}/rcon/execute`, { action: "say", message: "hi" });
        expect(memberExec.status === 403 && String(memberExec.body?.error || "").includes("MODERATOR"), "member needs MODERATOR for execute");

        // No code path ever seeds RCON credentials, so even RUNNING the honest
        // answer is a null result — flip the status directly in the throwaway DB.
        await prisma.server.update({ where: { id: serverId }, data: { status: "RUNNING" } });
        try {
          const res = await admin.post(`/api/servers/${serverId}/rcon/execute`, { action: "say", message: "hi" });
          expect(res.status === 200 && res.body?.success === true && res.body?.result === null, `RUNNING execute → ${res.status} result:${res.body?.result}`);
          const bad = await admin.post(`/api/servers/${serverId}/rcon/execute`, { action: "nuke" });
          expect(bad.status === 400 && String(bad.body?.error || "").includes("Unsupported"), "unsupported action 400s");
          const players = await admin.get(`/api/servers/${serverId}/rcon/players`);
          expect(players.status === 200 && JSON.stringify(players.body?.players) === "[]", "RUNNING players without RCON creds is []");
        } finally {
          await prisma.server.update({ where: { id: serverId }, data: { status: "STOPPED" } });
        }
      });
    }
  ),
];
