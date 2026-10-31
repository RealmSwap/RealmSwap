/**
 * Marketplace + Realms round-trip (PR-C): server export → realms/validate →
 * realms/import (a full .realm package round-trip through the app), then the
 * cloud marketplace over the fake Supabase's PostgREST surface: publish →
 * list → mine → versions → favorite → deploy (which creates a real local
 * server and writes the payload's config overrides).
 */

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { expect } from "../client";
import { DATA_DIR } from "../config";
import { scenario, step, type ScenarioContext } from "./framework";
import { serverDir, memberClient } from "./surface";
import { getBinary, postRaw } from "./fixtures";

/** Extract ./realm.json from a .realm (gzip tar) buffer via the system tar. */
function readRealmJson(bytes: Buffer): any {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-e2e-realm-"));
  try {
    const tarPath = path.join(dir, "export.realm");
    fs.writeFileSync(tarPath, bytes);
    execFileSync("tar", ["-xzf", tarPath, "-C", dir, "./realm.json"]);
    return JSON.parse(fs.readFileSync(path.join(dir, "realm.json"), "utf8"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export const marketplaceScenarios = [
  scenario(
    "marketplace/realms-roundtrip",
    "export→validate→import package round-trip + marketplace publish/list/favorite/deploy",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const serverId = ctx.state.surfaceServerId as string;
      const member = await memberClient(ctx);

      let exportBytes = Buffer.alloc(0);
      let uploadId = "";
      await step("export streams a .realm tar and validate consumes it", async () => {
        const memberExport = await member.get(`/api/servers/${serverId}/export`);
        expect(memberExport.status === 404, `member export → ${memberExport.status}, want 404 (owner-only)`);

        const res = await getBinary(admin, `/api/servers/${serverId}/export`);
        expect(res.status === 200, `export → ${res.status}`);
        expect((res.headers.get("content-type") || "").includes("application/x-gzip"), "export is a gzipped tar");
        expect((res.headers.get("content-disposition") || "").includes(".realm"), "attachment filename ends in .realm");
        exportBytes = Buffer.from(res.bytes);
        expect(exportBytes.length > 0, "non-empty payload");

        const manifest = readRealmJson(exportBytes);
        expect(manifest?.formatVersion === 1, "realm.json formatVersion 1");
        expect(manifest?.server?.game === "MINECRAFT", `manifest game → ${manifest?.server?.game}`);
        expect(JSON.stringify(manifest).toLowerCase().includes("e2e-secret") === false, "no host-link secrets leak into the export");

        const garbage = await postRaw(admin, "/api/realms/validate", Buffer.from("not a tar at all"));
        expect(garbage.status === 400, `validate garbage → ${garbage.status}, want 400`);
        expect(garbage.text.includes("realm.json"), `error names the missing manifest → ${garbage.text.slice(0, 120)}`);

        const validated = await postRaw(admin, "/api/realms/validate", exportBytes);
        expect(validated.status === 200, `validate → ${validated.status}: ${validated.text.slice(0, 200)}`);
        uploadId = validated.body?.uploadId;
        expect(/^[0-9a-f-]{36}$/.test(uploadId), `uploadId shape → ${uploadId}`);
        expect(validated.body?.manifest?.server?.name === "E2E Surface Server", "manifest round-trips the server name");
        expect(validated.body?.sizeBytes === exportBytes.length, "sizeBytes matches the upload");
      });

      let importedServerId = "";
      await step("import NEW creates the (Imported) server with the package files", async () => {
        const badUpload = await admin.post("/api/realms/import", {
          uploadId: "00000000-0000-4000-8000-000000000000", mode: "NEW",
          manifest: { server: { name: "X", game: "MINECRAFT" } },
        });
        expect(badUpload.status === 400, `unknown uploadId → ${badUpload.status}, want 400`);

        const manifest = readRealmJson(exportBytes);
        const res = await admin.post("/api/realms/import", { uploadId, mode: "NEW", manifest });
        expect(res.status === 200, `import → ${res.status}: ${res.text.slice(0, 300)}`);
        importedServerId = res.body?.serverId;
        expect(!!importedServerId, "import returns the new server id");
        ctx.state.importedServerId = importedServerId;

        const list = await admin.get("/api/servers");
        const imported = (list.body?.servers ?? []).find((s: any) => s.id === importedServerId);
        expect(!!imported && imported.name.includes("(Imported)"), `imported server listed → ${imported?.name}`);
        expect(fs.existsSync(path.join(serverDir(importedServerId), "server.properties")), "config file extracted");
        expect(fs.existsSync(path.join(serverDir(importedServerId), "world", "level.dat")), "world extracted from the package");
      });

      let realmId = "";
      await step("publish guards + a real publish with secret scrubbing", async () => {
        const list = await admin.get("/api/marketplace");
        expect(list.status === 200 && list.body?.results?.length === 0, "marketplace starts empty");
        const memberList = await member.get("/api/marketplace");
        expect(memberList.status === 200, "marketplace list is readable by any session");
        const unauth = await fetch(`${admin.baseUrl}/api/marketplace`);
        expect(unauth.status === 401, `unauth list → ${unauth.status}, want 401`);

        const noPayload = await admin.post("/api/marketplace/publish", { name: "X" });
        expect(noPayload.status === 400, `publish without payload → ${noPayload.status}, want 400`);
        const withScript = await admin.post("/api/marketplace/publish", {
          payload: {}, customDefSpec: { install: { installScript: "rm -rf /" } },
        });
        expect(withScript.status === 400 && String(withScript.body?.error).includes("installScript"), "installScript refused");

        const published = await admin.post("/api/marketplace/publish", {
          name: "E2E Surface Realm",
          description: "Round-tripped from the surface server",
          gameSlug: "MINECRAFT",
          tags: ["survival", "e2e"],
          payload: {
            configOverrides: [{ path: "server.properties", content: "motd=default\nadmin_password=hunter2\n" }],
          },
        });
        expect(published.status === 200, `publish → ${published.status}: ${published.text.slice(0, 300)}`);
        realmId = published.body?.id;
        expect(!!realmId, "publish returns the realm id");
        expect(published.body?.strippedSecrets === true, "password in config override was scrubbed");

        const mine = await admin.get("/api/marketplace/mine");
        expect(mine.status === 200 && mine.body?.realms?.length === 1, "mine lists the new realm");
        const memberMine = await member.get("/api/marketplace/mine");
        expect(memberMine.body?.realms?.length === 0, "member's mine is empty (seller-scoped)");

        const versions = await admin.get(`/api/marketplace/${realmId}/versions`);
        expect(versions.status === 200 && versions.body?.versions?.length === 1, "one version after publish");
      });

      await step("marketplace list surfaces the realm; favorites toggle", async () => {
        const listed = await admin.get("/api/marketplace?game=MINECRAFT");
        expect(listed.status === 200, `list → ${listed.status}`);
        const row = (listed.body?.results ?? []).find((r: any) => r.id === realmId);
        expect(!!row, "published realm appears in the public list");
        expect(row?.tags === "survival,e2e", `tags joined → ${row?.tags}`);
        expect(row?.userFavorited === false && row?.favorites === 0, "no favorites yet");
        expect(typeof row?.payload === "string", "payload serialized as JSON string");

        const fav = await admin.post(`/api/marketplace/${realmId}/favorite`, { favorited: true });
        expect(fav.status === 200 && fav.body?.success === true, "favorite on");
        const afterFav = await admin.get("/api/marketplace?game=MINECRAFT");
        const favRow = afterFav.body?.results?.find((r: any) => r.id === realmId);
        expect(favRow?.userFavorited === true && favRow?.favorites === 1, "favorite counted");

        const unfav = await admin.post(`/api/marketplace/${realmId}/favorite`, { favorited: false });
        expect(unfav.status === 200, "favorite off");
        const afterUnfav = await admin.get("/api/marketplace?game=MINECRAFT");
        expect(afterUnfav.body?.results?.find((r: any) => r.id === realmId)?.userFavorited === false, "favorite cleared");

        const memberFav = await member.post(`/api/marketplace/${realmId}/favorite`, { favorited: true });
        expect(memberFav.status === 200, "another user can favorite too");
        await member.post(`/api/marketplace/${realmId}/favorite`, { favorited: false });
      });

      await step("deploy creates a real local server from the realm payload", async () => {
        const missing = await admin.post("/api/marketplace/deploy", {});
        expect(missing.status === 400, `deploy without templateId → ${missing.status}, want 400`);
        const unknown = await admin.post("/api/marketplace/deploy", { templateId: "no-such-realm" });
        expect(unknown.status === 404, `deploy unknown → ${unknown.status}, want 404`);

        const res = await admin.post("/api/marketplace/deploy", { templateId: realmId });
        expect(res.status === 200, `deploy → ${res.status}: ${res.text.slice(0, 300)}`);
        const deployedId = res.body?.serverId;
        expect(!!deployedId, "deploy returns the server id");
        ctx.state.deployedServerId = deployedId;

        const list = await admin.get("/api/servers");
        const deployed = (list.body?.servers ?? []).find((s: any) => s.id === deployedId);
        expect(!!deployed && deployed.name.includes("E2E Surface Realm"), `deployed server listed → ${deployed?.name}`);
        const override = path.join(serverDir(deployedId), "server.properties");
        expect(fs.existsSync(override), "config override file written into the deployed server dir");
        expect(fs.readFileSync(override, "utf8").includes("admin_password=***REMOVED***"), "override content kept the scrub");
      });

      await step("publishing a new version keeps history", async () => {
        const res = await admin.post("/api/marketplace/publish", {
          realmId, version: "1.0.1", changelog: "e2e update",
          payload: { configOverrides: [{ path: "server.properties", content: "motd=v2\n" }] },
        });
        expect(res.status === 200, `version publish → ${res.status}: ${res.text.slice(0, 300)}`);
        expect(res.body?.version === "1.0.1", "version echoed");
        const versions = await admin.get(`/api/marketplace/${realmId}/versions`);
        expect(versions.body?.versions?.length === 2, "two versions now");
        expect(versions.body?.versions?.[0]?.version === "1.0.1", "newest version first");
      });
    }
  ),
];
