/**
 * Mods pipeline end-to-end against live Modrinth — the @smoke half of the
 * plan's PR-B. Reuses the server mcLifecycle restored (vanilla, installed
 * once, stopped) so no extra server.jar download is paid, then walks the real
 * mods surface: provider search → loader-gate/client refusals → fabric loader
 * install → Modrinth install with the required-dependency BFS → config
 * get/put → enable/disable → updates → update-all → export/import round trip
 * → uninstall → reconcile → the RUNNING-state 400 gates → non-member 403.
 *
 * Live pins (re-verified against api.modrinth.com when this scenario was
 * written; all have 26.2-compatible builds):
 *  - architectury-api (project lhGA9TYQ) — its 26.2 builds require
 *    fabric-api (P7dR8mSH), which proves the dependency BFS; installing the
 *    oldest 26.2 build leaves the newest for update-all.
 *  - sodium — server_side: unsupported, refused before any download.
 */

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { ApiClient, expect } from "../client";
import { APP_BASE_URL, DATA_DIR } from "../config";
import { MEMBER_USER_AFTER_ROTATION } from "./auth";
import { pollUntil, scenario, sleep, step, type ScenarioContext } from "./framework";
import {
  E2E_CONFIG_TOML,
  makeBadZip,
  openSse,
  postMultipart,
} from "./fixtures";

// Modrinth pins.
const ARCHITECTURY_PROJECT_ID = "lhGA9TYQ"; // architectury-api
const ARCHITECTURY_OLD_VERSION = "21.0.2+fabric"; // oldest 26.2-compatible build at pin time
const FABRIC_API_PROJECT_ID = "P7dR8mSH"; // architectury's required dependency
const SODIUM_PROJECT_ID = "AANobbMI"; // server_side: unsupported

function getServer(admin: ApiClient, id: string): Promise<any | null> {
  return admin.get("/api/servers").then((res) => {
    if (res.status !== 200) throw new Error(`GET /api/servers → ${res.status}`);
    return (res.body?.servers ?? []).find((s: any) => s.id === id) ?? null;
  });
}

function serverRoot(serverId: string): string {
  return path.join(DATA_DIR, "local-servers", serverId);
}

function modsDir(serverId: string): string {
  return path.join(serverRoot(serverId), "mods");
}

async function listMods(admin: ApiClient, serverId: string): Promise<any[]> {
  const res = await admin.get(`/api/servers/${serverId}/mods`);
  expect(res.status === 200, `GET mods → ${res.status}: ${res.text.slice(0, 200)}`);
  return res.body?.mods ?? [];
}

/** The fabric loader marker lives at <serverRoot>/realmswap-loader.json. */
function readLoaderMarkerOnDisk(serverId: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(serverRoot(serverId), "realmswap-loader.json"), "utf8"));
  } catch {
    return null;
  }
}

export const modsScenarios = [
  scenario(
    "mods/search-install-lifecycle",
    "search → refusal paths → fabric loader → Modrinth install + dependency BFS + SSE progress → config → enable/disable → updates/update-all → export/import → uninstall → reconcile → RUNNING gates",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const definitionId = ctx.state.definitionId as string;

      await step("base server exists, installed once, and is stopped", async () => {
        let serverId = ctx.state.modsBaseServerId as string | undefined;
        if (!serverId || !(await getServer(admin, serverId))) {
          // Standalone fallback: mcLifecycle didn't run (or its restore failed).
          expect(!!definitionId, "Minecraft definition must exist to create a fallback server");
          const res = await admin.post("/api/servers", {
            name: "E2E Mods Base",
            definitionId,
            ramAllocation: 2,
          });
          expect(res.status === 201, `fallback create → ${res.status}: ${res.text.slice(0, 200)}`);
          serverId = res.body.id;
          ctx.state.modsBaseServerId = serverId;
        }
        const server = await getServer(admin, serverId!);
        expect(!!server, "base server must exist");
        expect(
          fs.existsSync(path.join(serverRoot(serverId!), "server.jar")),
          "base server must have server.jar (installed once) for loader/pack preflights"
        );
        if (server.status !== "STOPPED") {
          await admin.post(`/api/servers/${serverId}/stop`);
          await pollUntil(() => getServer(admin, serverId!), (s) => s?.status === "STOPPED", 90_000, 2000);
        }
      });

      const serverId = ctx.state.modsBaseServerId as string;

      await step("search returns live Modrinth results", async () => {
        const res = await admin.get(`/api/servers/${serverId}/mods/search?q=carpet`);
        expect(res.status === 200, `search → ${res.status}: ${res.text.slice(0, 200)}`);
        const results = res.body?.results ?? [];
        expect(results.length >= 1, "live Modrinth search must return at least one result");
        const first = results[0];
        for (const key of ["provider", "packageId", "name", "version"]) {
          expect(key in first, `search result must carry ${key}`);
        }
        expect(
          results.every((r: any) => r.provider === "modrinth" || r.provider === "curseforge"),
          `search results are provider-tagged (saw: ${results.slice(0, 5).map((r: any) => r.provider).join(",")})`
        );
      });

      await step("loader state is honest on a vanilla server", async () => {
        const res = await admin.get(`/api/servers/${serverId}/mods/loader`);
        expect(res.status === 200, `GET loader → ${res.status}`);
        expect(res.body?.supported === true, "Minecraft must report loader support");
        expect(res.body?.loader === null, `vanilla loader marker → ${JSON.stringify(res.body?.loader)}, want null`);
      });

      await step("installing a loader-dependent mod on vanilla is refused", async () => {
        const res = await admin.post(`/api/servers/${serverId}/mods/install`, {
          modType: "MODRINTH",
          modId: ARCHITECTURY_PROJECT_ID,
          version: ARCHITECTURY_OLD_VERSION,
        });
        expect(res.status === 500, `install without loader → ${res.status}, want 500: ${res.text.slice(0, 200)}`);
        expect(
          /requires the fabric loader/i.test(res.body?.error ?? ""),
          `refusal message → ${res.body?.error}`
        );
        expect((await listMods(admin, serverId)).length === 0, "no rows may exist after the refusal");
      });

      await step("installing a client-only mod is refused", async () => {
        const res = await admin.post(`/api/servers/${serverId}/mods/install`, {
          modType: "MODRINTH",
          modId: SODIUM_PROJECT_ID,
        });
        expect(res.status === 500, `client-only install → ${res.status}, want 500: ${res.text.slice(0, 200)}`);
        expect(
          /client-side mod/i.test(res.body?.error ?? ""),
          `client refusal message → ${res.body?.error}`
        );
        expect((await listMods(admin, serverId)).length === 0, "no rows may exist after the refusal");
      });

      await step("fabric loader installs and passes the boot test", async () => {
        const res = await admin.post(`/api/servers/${serverId}/mods/loader`, { loader: "fabric" });
        expect(res.status === 200, `POST loader fabric → ${res.status}: ${res.text.slice(0, 300)}`);
        expect(res.body?.loader?.type === "fabric", `marker type → ${res.body?.loader?.type}`);
        expect(res.body?.loader?.minecraftVersion === "26.2", `marker mcVersion → ${res.body?.loader?.minecraftVersion}, want 26.2`);
        expect(!!readLoaderMarkerOnDisk(serverId), "realmswap-loader.json must exist on disk");
        const get = await admin.get(`/api/servers/${serverId}/mods/loader`);
        expect(get.body?.loader?.type === "fabric", "GET loader reflects the installed marker");
      });

      let installId = "";
      await step(
        "Modrinth install with live dependency BFS streams progress over SSE",
        async () => {
          installId = `e2e-modinstall-${Date.now()}`;
          // Start the POST first and subscribe only after the route's
          // beginProgress has certainly run — a subscription that lands
          // before it gets a single "no active install" error frame.
          const post = admin.post(`/api/servers/${serverId}/mods/install`, {
            modType: "MODRINTH",
            modId: ARCHITECTURY_PROJECT_ID,
            version: ARCHITECTURY_OLD_VERSION,
            installId,
          });
          await sleep(1200);
          const stream = await openSse(
            `/api/servers/${serverId}/mods/install-progress?installId=${installId}`,
            admin
          ).done(5 * 60_000);
          const res = await post;
          expect(res.status === 200, `install → ${res.status}: ${res.text.slice(0, 300)}`);
          expect(res.body?.success === true, `install success flag → ${res.body?.success}`);
          expect(
            (res.body?.dependencyCount ?? 0) >= 1,
            `dependencyCount → ${res.body?.dependencyCount}, want ≥1 (fabric-api)`
          );
          const stages = stream.events.map((e) => e.stage);
          expect(stages.includes("boot"), `SSE must carry the boot stage (stages: ${stages.join(",")})`);
          const terminal = stream.events.at(-1);
          expect(terminal?.stage === "done", `SSE terminal stage → ${terminal?.stage}, want done`);
          expect(stream.closed || terminal?.stage === "done", "SSE closes after the terminal frame");
        }
      );

      await step("dependency BFS installed fabric-api alongside the mod", async () => {
        const mods = await listMods(admin, serverId);
        const byPackage = new Map(mods.map((m) => [m.packageId, m]));
        expect(byPackage.has(ARCHITECTURY_PROJECT_ID), "architectury row exists");
        expect(byPackage.has(FABRIC_API_PROJECT_ID), "fabric-api (required dep) row exists");
        expect(
          fs.existsSync(path.join(modsDir(serverId), `${ARCHITECTURY_PROJECT_ID}.jar`)),
          "architectury jar on disk"
        );
        expect(
          fs.existsSync(path.join(modsDir(serverId), `${FABRIC_API_PROJECT_ID}.jar`)),
          "fabric-api jar on disk"
        );
        ctx.state.architecturyRowId = byPackage.get(ARCHITECTURY_PROJECT_ID)!.id;
        ctx.state.fabricApiRowId = byPackage.get(FABRIC_API_PROJECT_ID)!.id;
      });

      await step("config resolves the jar's modid, parses, saves, and backs up", async () => {
        // The route resolves config/<modid>.toml by the jar's metadata id.
        const jar = path.join(modsDir(serverId), `${ARCHITECTURY_PROJECT_ID}.jar`);
        const meta = JSON.parse(new AdmZip(jar).readAsText("fabric.mod.json"));
        const configDir = path.join(serverRoot(serverId), "config");
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, `${meta.id}.toml`), E2E_CONFIG_TOML);

        const get = await admin.get(`/api/servers/${serverId}/mods/${ctx.state.architecturyRowId}/config`);
        expect(get.status === 200, `GET config → ${get.status}: ${get.text.slice(0, 200)}`);
        expect(get.body?.format === "toml", `config format → ${get.body?.format}`);
        const section = (get.body?.sections ?? []).find((s: any) => s.name === "realmswape2e");
        expect(!!section, "GET config must surface the fixture section");
        const message = section.properties.find((p: any) => p.key === "message");
        expect(!!message, "GET config must surface the message property");

        // Submit the parsed sections back with edited values — the same
        // round-trip the UI does (property `type` must ride along, or the
        // serializer can't keep literals parseable).
        const edited = {
          sections: [
            {
              name: "realmswape2e",
              properties: [
                { ...message, value: "hello-from-e2e-EDITED" },
                { ...section.properties.find((p: any) => p.key === "enabled"), value: "false" },
              ],
            },
          ],
        };
        const put = await admin.post(
          `/api/servers/${serverId}/mods/${ctx.state.architecturyRowId}/config`,
          edited
        );
        expect(put.status === 200, `POST config → ${put.status}: ${put.text.slice(0, 200)}`);
        const tomlPath = path.join(configDir, `${meta.id}.toml`);
        const after = fs.readFileSync(tomlPath, "utf8");
        expect(after.includes("hello-from-e2e-EDITED"), "config file must carry the edited value");
        expect(after.includes("enabled = false"), "config file must carry the toggled boolean");
        expect(fs.existsSync(`${tomlPath}.bak`), "config save must leave a .bak backup");
      });

      await step("enable/disable rename the jar on disk", async () => {
        const jar = `${ARCHITECTURY_PROJECT_ID}.jar`;
        const disable = await admin.post(`/api/servers/${serverId}/mods/${ARCHITECTURY_PROJECT_ID}/disable`);
        expect(disable.status === 200, `disable → ${disable.status}: ${disable.text.slice(0, 200)}`);
        expect(disable.body?.disabled === true, "disable response flags disabled");
        expect(fs.existsSync(path.join(modsDir(serverId), `${jar}.disabled`)), "jar renamed to .disabled");
        expect(!fs.existsSync(path.join(modsDir(serverId), jar)), "original jar gone while disabled");
        const rows = await listMods(admin, serverId);
        expect(
          rows.find((m) => m.packageId === ARCHITECTURY_PROJECT_ID)?.disabled === true,
          "row disabled flag flips"
        );
        const enable = await admin.post(`/api/servers/${serverId}/mods/${ARCHITECTURY_PROJECT_ID}/enable`);
        expect(enable.status === 200, `enable → ${enable.status}`);
        expect(fs.existsSync(path.join(modsDir(serverId), jar)), "jar restored on enable");
      });

      await step("updates sees the pinned-old architectury build", async () => {
        const res = await admin.get(`/api/servers/${serverId}/mods/updates`);
        expect(res.status === 200, `updates → ${res.status}: ${res.text.slice(0, 200)}`);
        const updates = res.body?.updates ?? [];
        const arch = updates.find((u: any) => u.packageId === ARCHITECTURY_PROJECT_ID);
        expect(!!arch, `updates must list architectury (got: ${JSON.stringify(updates).slice(0, 200)})`);
        expect(arch.current === ARCHITECTURY_OLD_VERSION, `updates current → ${arch.current}`);
        expect(arch.latest !== ARCHITECTURY_OLD_VERSION, `updates latest → ${arch.latest}, want newer`);
      });

      await step("update-all applies the newer build and passes one boot test", async () => {
        const res = await admin.post(`/api/servers/${serverId}/mods/update-all`, {});
        expect(res.status === 200, `update-all → ${res.status}: ${res.text.slice(0, 300)}`);
        const updated = res.body?.updated ?? [];
        const arch = updated.find((u: any) => u.name === "Architectury API" || /architectury/i.test(u.name));
        expect(!!arch, `update-all must update architectury (updated: ${JSON.stringify(updated).slice(0, 200)})`);
        const row = (await listMods(admin, serverId)).find((m) => m.packageId === ARCHITECTURY_PROJECT_ID);
        expect(row.version !== ARCHITECTURY_OLD_VERSION, `row version after update-all → ${row.version}`);
      });

      await step("single update is up to date; check-update is umod-only", async () => {
        const res = await admin.post(`/api/servers/${serverId}/mods/${ARCHITECTURY_PROJECT_ID}/update`, {});
        expect(res.status === 200, `update → ${res.status}: ${res.text.slice(0, 200)}`);
        expect(res.body?.updated === false, `update(updated) → ${res.body?.updated}, want false`);
        const check = await admin.get(
          `/api/servers/${serverId}/mods/${ctx.state.architecturyRowId}/check-update`
        );
        expect(check.status === 400, `check-update non-umod → ${check.status}, want 400`);
        expect(/umod/i.test(check.body?.error ?? ""), `check-update message → ${check.body?.error}`);
      });

      await step("export produces a collection manifest", async () => {
        const res = await admin.get(`/api/servers/${serverId}/mods/export`);
        expect(res.status === 200, `export → ${res.status}`);
        expect(
          (res.headers.get("content-disposition") ?? "").includes("attachment"),
          "export must be an attachment download"
        );
        expect(res.body?.game === "MINECRAFT", `export game → ${res.body?.game}`);
        expect(res.body?.loader?.type === "fabric", `export loader → ${res.body?.loader?.type}`);
        const exported = (res.body?.mods ?? []).map((m: any) => m.packageId);
        expect(exported.includes(ARCHITECTURY_PROJECT_ID), "export must include architectury");
        ctx.state.exportedManifest = res.body;
      });

      await step("import replays the exported manifest through one batch boot test", async () => {
        const manifest = ctx.state.exportedManifest as any;
        const form = new FormData();
        form.append(
          "collection",
          new Blob([JSON.stringify(manifest)], { type: "application/json" }),
          "collection.json"
        );
        const res = await fetch(`${APP_BASE_URL}/api/servers/${serverId}/mods/import`, {
          method: "POST",
          headers: { cookie: admin.cookie() },
          body: form,
        });
        const text = await res.text();
        expect(res.status === 200, `import → ${res.status}: ${text.slice(0, 300)}`);
        const body = JSON.parse(text);
        expect(body.success === true, `import success → ${body.success}`);
        const rows = await listMods(admin, serverId);
        expect(
          rows.some((m) => m.packageId === ARCHITECTURY_PROJECT_ID),
          "architectury still installed after re-import"
        );
      });

      await step("uninstall removes the row, the jar, and the disabled twin", async () => {
        const res = await admin.delete(`/api/servers/${serverId}/mods/${ARCHITECTURY_PROJECT_ID}`);
        expect(res.status === 200, `uninstall → ${res.status}: ${res.text.slice(0, 200)}`);
        const rows = await listMods(admin, serverId);
        expect(!rows.some((m) => m.packageId === ARCHITECTURY_PROJECT_ID), "row must be gone");
        expect(
          !fs.existsSync(path.join(modsDir(serverId), `${ARCHITECTURY_PROJECT_ID}.jar`)) &&
            !fs.existsSync(path.join(modsDir(serverId), `${ARCHITECTURY_PROJECT_ID}.jar.disabled`)),
          "jar and .disabled must be gone"
        );
      });

      await step("reconcile syncs disk ↔ rows in both directions", async () => {
        // A jar on disk with no row → reconcile adds a row for it.
        const stray = path.join(modsDir(serverId), "stray-e2e-test.jar");
        fs.copyFileSync(path.join(modsDir(serverId), `${FABRIC_API_PROJECT_ID}.jar`), stray);
        const added = await admin.post(`/api/servers/${serverId}/mods/reconcile`, {});
        expect(added.status === 200, `reconcile(add) → ${added.status}: ${added.text.slice(0, 200)}`);
        expect((added.body?.result?.added ?? 0) >= 1, `reconcile added → ${JSON.stringify(added.body?.result)}`);
        expect(
          (added.body?.mods ?? []).some((m: any) => m.packageId === "stray-e2e-test"),
          "reconcile must surface the stray row"
        );
        // Then removing the jar makes the same call remove the orphan row.
        fs.unlinkSync(stray);
        const removed = await admin.post(`/api/servers/${serverId}/mods/reconcile`, {});
        expect(removed.status === 200, `reconcile(remove) → ${removed.status}`);
        expect((removed.body?.result?.removed ?? 0) >= 1, `reconcile removed → ${JSON.stringify(removed.body?.result)}`);
        expect(
          !(removed.body?.mods ?? []).some((m: any) => m.packageId === "stray-e2e-test"),
          "stray row must be gone after reconcile"
        );
      });

      await step("a broken modpack upload is refused by the preflight with a 400", async () => {
        const res = await postMultipart(
          admin,
          `/api/servers/${serverId}/mods/import-modpack`,
          "modpack",
          { data: makeBadZip(), filename: "not-a-pack.zip" }
        );
        expect(res.status === 400, `bad zip import → ${res.status}, want 400: ${res.text.slice(0, 200)}`);
        expect(!!res.body?.error, "preflight refusal must carry an error message");
      });

      await step("every STOPPED-only mutation 400s while the server is RUNNING", async () => {
        const start = await admin.post(`/api/servers/${serverId}/start`);
        expect(start.status === 200, `start → ${start.status}`);
        await pollUntil(() => getServer(admin, serverId), (s) => s?.status === "RUNNING", 180_000, 3000);
        const cases: Array<[string, Promise<{ status: number; text: string }>]> = [
          ["install", admin.post(`/api/servers/${serverId}/mods/install`, { modType: "MODRINTH", modId: ARCHITECTURY_PROJECT_ID })],
          ["enable", admin.post(`/api/servers/${serverId}/mods/${FABRIC_API_PROJECT_ID}/enable`)],
          ["disable", admin.post(`/api/servers/${serverId}/mods/${FABRIC_API_PROJECT_ID}/disable`)],
          ["update-all", admin.post(`/api/servers/${serverId}/mods/update-all`, {})],
          ["uninstall", admin.delete(`/api/servers/${serverId}/mods/${FABRIC_API_PROJECT_ID}`)],
          ["loader", admin.post(`/api/servers/${serverId}/mods/loader`, { loader: "fabric" })],
          [
            // architectury was uninstalled earlier — use the row that still
            // exists; the RUNNING gate fires before any config resolution.
            "config-put",
            admin.post(`/api/servers/${serverId}/mods/${ctx.state.fabricApiRowId}/config`, { sections: [] }),
          ],
        ];
        for (const [name, call] of cases) {
          const res = await call;
          expect(res.status === 400, `${name} while RUNNING → ${res.status}, want 400: ${res.text.slice(0, 160)}`);
        }
        const stop = await admin.post(`/api/servers/${serverId}/stop`);
        expect(stop.status === 200, `stop → ${stop.status}`);
      });

      await step("a non-member cannot install mods on the owner's server", async () => {
        const member = new ApiClient(APP_BASE_URL);
        const login = await member.post("/api/auth/login", MEMBER_USER_AFTER_ROTATION);
        expect(login.status === 200, `member login → ${login.status}`);
        const res = await member.post(`/api/servers/${serverId}/mods/install`, {
          modType: "MODRINTH",
          modId: ARCHITECTURY_PROJECT_ID,
        });
        expect(res.status === 403, `member install → ${res.status}, want 403`);
      });
    }
  ),
];
