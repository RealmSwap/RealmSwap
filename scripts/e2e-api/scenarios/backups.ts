/**
 * Backups + S3 + storage (PR-C): snapshot create/verify/restore against a real
 * zip on disk, retention pruning, snapshot-deletes, vault-archive deletes, the
 * two storage surfaces, and S3 offsite settings (configured + honest failure).
 *
 * The backup pipeline never boots a game server: a world dir with a level.dat
 * is all the backup service needs, so everything here is fast and offline.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { expect } from "../client";
import { DATA_DIR } from "../config";
import { scenario, step, type ScenarioContext } from "./framework";
import { serverDir, memberClient } from "./surface";
import { prisma } from "../dbFixture";

export const backupScenarios = [
  scenario(
    "backups/s3-lifecycle",
    "backup create/verify/restore/prune/delete, archive delete, storage, S3 settings",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const definitionId = ctx.state.definitionId as string;
      const member = await memberClient(ctx);

      let serverId = "";
      await step("create the backup server and refuse a worldless snapshot", async () => {
        const res = await admin.post("/api/servers", { name: "E2E Backup Server", definitionId, ramAllocation: 2 });
        expect(res.status === 200 || res.status === 201, `create → ${res.status}: ${res.text.slice(0, 200)}`);
        serverId = res.body?.server?.id ?? res.body?.id;
        ctx.state.backupServerId = serverId;

        const none = await admin.post(`/api/servers/${serverId}/backups`, {});
        expect(none.status === 500, `backup without world → ${none.status}, want 500 (honest message)`);
        expect(String(none.body?.error || "").includes("No save files"), `error → ${none.body?.error}`);
      });

      const worldDir = path.join(serverDir(serverId), "world");
      let backupId = "";
      let backupZipPath = "";
      await step("create a verified snapshot of the seeded world", async () => {
        fs.mkdirSync(worldDir, { recursive: true });
        fs.writeFileSync(path.join(worldDir, "level.dat"), "e2e level data v1");
        fs.writeFileSync(path.join(worldDir, "session.lock"), "locked");
        // Incompressible filler so the storage route's 2-dp GB math clears 0.
        fs.writeFileSync(path.join(worldDir, "chunks.region"), crypto.randomBytes(6 * 1024 * 1024));

        const res = await admin.post(`/api/servers/${serverId}/backups`, {});
        expect(res.status === 201, `create backup → ${res.status}: ${res.text.slice(0, 200)}`);
        backupId = res.body?.id;
        backupZipPath = res.body?.filePath;
        expect(res.body?.backupType === "MANUAL", "manual snapshot created");
        expect(typeof res.body?.fileSizeMB === "number", "size recorded (tiny worlds round to 0 MB)");
        expect(res.body?.offsiteStatus === null, "no S3 creds → no offsite status");
        expect(fs.existsSync(backupZipPath) && backupZipPath.includes(serverId), "zip exists under local-backups/<serverId>/");

        const list = await admin.get(`/api/servers/${serverId}/backups`);
        expect(list.status === 200 && list.body?.length === 1, "list shows one row");
        expect(list.body[0]?.fileAvailable === true, "list reports file availability");
        // The create response snapshots the row before inline verification; the
        // list re-reads it, so verification state is asserted here.
        expect(!!list.body[0]?.verifiedAt, "snapshot verified inline at creation");
        const denied = await member.get(`/api/servers/${serverId}/backups`);
        expect(denied.status === 404, `stranger list → ${denied.status}, want 404`);
      });

      await step("verify: good zip passes, corrupt bytes fail, level.dat sentinel enforced", async () => {
        const good = await admin.post(`/api/servers/${serverId}/backups/${backupId}/verify`);
        expect(good.status === 200 && good.body?.success === true, `verify good → ${good.text.slice(0, 200)}`);
        expect((good.body?.entries ?? 0) > 0, "entry count reported");

        const original = fs.readFileSync(backupZipPath);
        fs.writeFileSync(backupZipPath, Buffer.from("corrupted beyond recognition"));
        const corrupt = await admin.post(`/api/servers/${serverId}/backups/${backupId}/verify`);
        expect(corrupt.status === 200 && corrupt.body?.success === false, "corrupt zip answers success:false with HTTP 200");
        const listed = await admin.get(`/api/servers/${serverId}/backups`);
        expect(!!listed.body?.[0]?.verifyError, "verifyError persisted on the row");

        // Restore refuses to touch the live world while the zip is broken.
        fs.writeFileSync(path.join(worldDir, "junk-marker.txt"), "must survive a failed restore");
        const refused = await admin.post(`/api/backups/${backupId}/restore`, {});
        expect(refused.status === 500, `restore corrupt → ${refused.status}, want 500`);
        expect(fs.existsSync(path.join(worldDir, "junk-marker.txt")), "failed restore left the world untouched");

        // Minecraft sentinel: a valid zip without level.dat is not a world.
        const worldless = new AdmZip();
        worldless.addFile("session.lock", Buffer.from("locked"));
        fs.writeFileSync(backupZipPath, worldless.toBuffer());
        const sentinel = await admin.post(`/api/servers/${serverId}/backups/${backupId}/verify`);
        expect(sentinel.status === 200 && sentinel.body?.success === false, "worldless zip fails");
        expect(String(sentinel.body?.error || "").includes("level.dat"), `sentinel message → ${sentinel.body?.error}`);

        fs.writeFileSync(backupZipPath, original);
      });

      await step("restore: atomic world swap replaces junk with the snapshot", async () => {
        const res = await admin.post(`/api/backups/${backupId}/restore`, {});
        expect(res.status === 200 && res.body?.success === true, `restore → ${res.status}: ${res.text.slice(0, 200)}`);
        expect(fs.existsSync(path.join(worldDir, "level.dat")), "level.dat restored");
        expect(!fs.existsSync(path.join(worldDir, "junk-marker.txt")), "junk marker replaced away by the swap");
      });

      await step("restore refuses a RUNNING server (corruption guard)", async () => {
        await prisma.server.update({ where: { id: serverId }, data: { status: "RUNNING" } });
        try {
          const res = await admin.post(`/api/backups/${backupId}/restore`, {});
          expect(res.status === 500, `restore RUNNING → ${res.status}, want 500`);
          expect(String(res.body?.error || "").includes("stop the server"), "message names the save-corruption guard");
          const offsite = await admin.post(`/api/backups/${backupId}/restore`, { offsite: true });
          expect(offsite.status === 400, `offsite restore without upload → ${offsite.status}, want 400`);
        } finally {
          await prisma.server.update({ where: { id: serverId }, data: { status: "STOPPED" } });
        }
      });

      let secondId = "";
      let thirdId = "";
      await step("settings: interval validation and retention pruning", async () => {
        const second = await admin.post(`/api/servers/${serverId}/backups`, { customName: "e2e second" });
        expect(second.status === 201 && second.body?.name === "e2e second", "custom-named snapshot");
        secondId = second.body?.id;
        const third = await admin.post(`/api/servers/${serverId}/backups`, { customName: "e2e third" });
        thirdId = third.body?.id;

        const badInterval = await admin.post(`/api/servers/${serverId}/backups/settings`, { snapshotInterval: 7 });
        expect(badInterval.status === 400, `interval 7 → ${badInterval.status}, want 400`);
        const badRetention = await admin.post(`/api/servers/${serverId}/backups/settings`, { snapshotInterval: 6, backupRetention: 501 });
        expect(badRetention.status === 400, `retention 501 → ${badRetention.status}, want 400`);
        const missing = await admin.post(`/api/servers/${serverId}/backups/settings`, {});
        expect(missing.status === 400, `missing interval → ${missing.status}, want 400`);

        const saved = await admin.post(`/api/servers/${serverId}/backups/settings`, { snapshotInterval: 6, backupRetention: 2 });
        expect(saved.status === 200, `settings save → ${saved.status}: ${saved.text.slice(0, 200)}`);
        expect(saved.body?.snapshotInterval === 6 && saved.body?.backupRetention === 2, "values persisted on the row");
        expect(saved.body?.prunedBackups >= 1, `prune removed ≥1 → ${saved.body?.prunedBackups}`);

        const list = await admin.get(`/api/servers/${serverId}/backups`);
        expect(list.body?.length === 2, `retention 2 → ${list.body?.length} rows`);
        expect(!fs.existsSync(path.join(DATA_DIR, "local-backups", serverId, `${backupId}.zip`)), "oldest zip pruned from disk");

        const off = await admin.post(`/api/servers/${serverId}/backups/settings`, { snapshotInterval: 0 });
        expect(off.status === 200 && off.body?.lastSnapshotAt === null, "interval 0 disables and clears lastSnapshotAt");
      });

      await step("delete backup: row + zip gone, ownership enforced", async () => {
        const memberDelete = await member.delete(`/api/backups/${secondId}`);
        expect(memberDelete.status === 404, `member delete → ${memberDelete.status}, want 404 (row owner is the admin)`);
        const res = await admin.delete(`/api/backups/${secondId}`);
        expect(res.status === 200 && res.body?.success === true, "backup deleted");
        expect(!fs.existsSync(path.join(DATA_DIR, "local-backups", serverId, `${secondId}.zip`)), "zip unlinked");
        const again = await admin.delete(`/api/backups/${secondId}`);
        expect(again.status === 404, `second delete → ${again.status}, want 404`);
      });

      await step("archive delete: vault row + folder removed", async () => {
        const archiveId = "e2earchive0000";
        await prisma.archive.create({
          data: {
            id: archiveId,
            userId: (await prisma.user.findFirstOrThrow({ where: { email: "e2e-admin@realmswap.test" } })).id,
            serverName: "E2E Vault Server",
            game: "MINECRAFT",
            saveSizeGB: 0.001,
          },
        });
        const folder = path.join(DATA_DIR, "local-archives", archiveId, "world");
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, "level.dat"), "vault");

        const res = await admin.delete(`/api/archives/${archiveId}`);
        expect(res.status === 200 && res.body?.success === true, `archive delete → ${res.status}`);
        expect(!fs.existsSync(path.join(DATA_DIR, "local-archives", archiveId)), "vault folder removed");
        const again = await admin.delete(`/api/archives/${archiveId}`);
        expect(again.status === 404, `second archive delete → ${again.status}, want 404`);
      });

      await step("storage: per-server analytics + system location map", async () => {
        const res = await admin.get("/api/storage");
        expect(res.status === 200, `storage → ${res.status}`);
        const row = (res.body?.servers ?? []).find((s: any) => s.id === serverId);
        expect(!!row, "backup server appears in the analytics");
        expect((row?.worldsGB ?? 0) > 0, "worldsGB measured");
        expect((row?.backupsGB ?? 0) > 0, "backupsGB measured");
        expect(res.body?.dataRoot === DATA_DIR, `dataRoot → ${res.body?.dataRoot}`);
        expect(typeof res.body?.totals?.freeGB === "number" || res.body?.totals?.freeGB === null, "freeGB is number-or-null");

        const sys = await admin.get("/api/system/storage");
        expect(sys.status === 200, `system storage → ${sys.status}`);
        const keys = (sys.body?.locations ?? []).map((l: any) => l.key);
        expect(
          JSON.stringify(keys) === JSON.stringify(["dataRoot", "database", "servers", "backups", "snapshots", "steamcmd"]),
          `location keys → ${keys}`
        );
        expect(sys.body?.locations?.find((l: any) => l.key === "backups")?.exists === true, "backups location exists after a snapshot");
        const denied = await fetch(`${admin.baseUrl}/api/system/storage`);
        expect(denied.status === 401, `unauthenticated storage → ${denied.status}, want 401`);
      });

      await step("s3-settings: save with hint, honest dead-endpoint test", async () => {
        const memberDenied = await member.get("/api/user/s3-settings");
        expect(memberDenied.status === 403, `member s3-settings → ${memberDenied.status}, want 403 (ADMIN role)`);

        const fresh = await admin.get("/api/user/s3-settings");
        expect(fresh.status === 200 && fresh.body?.configured === false, "not configured initially");

        const noBucket = await admin.put("/api/user/s3-settings", { accessKey: "k", secretKey: "s" });
        expect(noBucket.status === 400, `PUT without bucket → ${noBucket.status}, want 400`);

        const saved = await admin.put("/api/user/s3-settings", {
          bucket: "e2e-bucket", accessKey: "AKIAE2E00000", secretKey: "e2e-secret", region: "us-east-1",
          // Keep every background offsite upload on loopback — no real S3 calls.
          endpoint: "http://127.0.0.1:9",
        });
        expect(saved.status === 200, `PUT s3 → ${saved.status}: ${saved.text.slice(0, 200)}`);
        const reread = await admin.get("/api/user/s3-settings");
        expect(reread.body?.configured === true && reread.body?.accessKeyHint?.endsWith("0000"), "accessKeyHint shows last4");
        expect(JSON.stringify(reread.body).includes("e2e-secret") === false, "secret never echoed");

        // Nothing listens on port 9 (discard) → deterministic fast failure.
        const test = await admin.post("/api/user/s3-settings/test", {
          bucket: "e2e-bucket", accessKey: "AKIAE2E00000", secretKey: "e2e-secret", endpoint: "http://127.0.0.1:9",
        });
        expect(test.status === 400, `dead-endpoint test → ${test.status}, want 400`);
        expect(String(test.body?.error || "").startsWith("Connection failed"), `error → ${test.body?.error}`);

        const noCreds = await admin.post("/api/user/s3-settings/test", {});
        expect(noCreds.status === 400, `test without creds → ${noCreds.status}, want 400`);
      });
    }
  ),
];
