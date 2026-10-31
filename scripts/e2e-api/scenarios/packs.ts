/**
 * Modpack pipeline (@heavy) — the plan's crown jewel on macOS/CI hardware.
 *
 * mods/pack-pipeline drives the Modrinth pack surface end-to-end on one fresh
 * server: install-pack (pinned .mrpack version, live resolution + download +
 * preflight + loader pin + client-exclusion pass + boot test) → update-pack
 * state asserts → re-import of the previous pack version (retires the mods
 * that left the manifest) → update-pack on an imported pack (refused) → a
 * crafted crash-jar gets blamed and quarantined by the boot test while a
 * real mod installs → the server still boots to RUNNING and answers the live
 * status ping.
 *
 * mods/curseforge-pack covers the CurseForge side (numeric project id,
 * newest-compatible file resolution, update-pack's CF "already newest" path)
 * and self-skips when the app has no CurseForge API key — CI without the
 * secret stays green, local runs with .env exercise it.
 *
 * Live pins (verified against api.modrinth.com when written; both versions
 * target Minecraft 26.2 / fabric-loader):
 *  - Adrenaline BYN9yKrV @ q1bUrD0m (26.5.1+mc26.2.fabric, 20 server files,
 *    11 client-only files the pipeline must skip)
 *  - Adrenaline @ r5uSD3JV (26.4.2+mc26.2.fabric) — drops 10 server files
 *    from 26.5.1, so the re-import must retire them
 *  - Fabric loader marker must read the pack's pin (0.19.5)
 */

import fs from "fs";
import net from "net";
import path from "path";
import { expect } from "../client";
import { APP_BASE_URL, BOOT_TIMEOUT_MS, DATA_DIR } from "../config";
import { pollUntil, scenario, sleep, step, type ScenarioContext } from "./framework";
import { makeBombJar, openSse, postMultipart } from "./fixtures";

const PACK_PROJECT_ID = "BYN9yKrV";
const PACK_VERSION_ID = "q1bUrD0m";
const OLDER_PACK_VERSION_ID = "r5uSD3JV";
const PACK_FABRIC_PIN = "0.19.5";
const CARPET_PROJECT_ID = "TQTTVgYE"; // Carpet — fabric, server_side: required, no deps

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

function getServer(admin: import("../client").ApiClient, id: string): Promise<any | null> {
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

/** Download a Modrinth version's primary file into memory (for mrpack uploads). */
async function downloadMrpack(versionId: string): Promise<Buffer> {
  const meta = await fetch(`https://api.modrinth.com/v2/version/${versionId}`, {
    headers: { "User-Agent": "realmswap-e2e/1.0 (scripts/e2e-api)" },
  });
  expect(meta.status === 200, `Modrinth version ${versionId} → ${meta.status}`);
  const v = await meta.json();
  const file = (v.files ?? []).find((f: any) => f.primary) ?? v.files?.[0];
  expect(!!file?.url, `version ${versionId} has no downloadable file`);
  const res = await fetch(file.url, { headers: { "User-Agent": "realmswap-e2e/1.0 (scripts/e2e-api)" } });
  expect(res.status === 200, `mrpack download → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function createBootedServer(admin: import("../client").ApiClient, name: string, ctx: ScenarioContext): Promise<string> {
  const res = await admin.post("/api/servers", {
    name,
    definitionId: ctx.state.definitionId,
    ramAllocation: 3,
  });
  expect(res.status === 201, `create ${name} → ${res.status}: ${res.text.slice(0, 200)}`);
  const serverId = res.body.id;
  const start = await admin.post(`/api/servers/${serverId}/start`);
  expect(start.status === 200, `start ${name} → ${start.status}: ${start.text.slice(0, 200)}`);
  const server = await pollUntil(
    () => getServer(admin, serverId),
    (s) => s?.status === "RUNNING" || s?.status === "CRASHED",
    BOOT_TIMEOUT_MS,
    3000
  );
  expect(server?.status === "RUNNING", `${name} vanilla boot → ${server?.status}`);
  const stop = await admin.post(`/api/servers/${serverId}/stop`);
  expect(stop.status === 200, `stop ${name} → ${stop.status}`);
  return serverId;
}

export const packScenarios = [
  scenario(
    "mods/pack-pipeline",
    "install-pack (pinned mrpack) → exclusions + pack loader pin → update-pack states → re-import retires replaced mods → crash-jar quarantined while installing a mod → RUNNING + live query ping",
    ["heavy"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;

      await step("fresh server boots vanilla once", async () => {
        const id = await createBootedServer(admin, "E2E Pack Pipeline", ctx);
        ctx.state.packServerId = id;
        const serverId = id;
        expect(!!serverId, "pack server id captured");
      });
      const serverId = ctx.state.packServerId as string;

      await step(
        "install-pack (Modrinth pin) runs the full pipeline behind live SSE",
        async () => {
          const installId = `e2e-packinstall-${Date.now()}`;
          // Start the POST first and subscribe only after the route's
          // beginProgress has certainly run — a subscription that lands
          // before it gets a single "no active install" error frame.
          const post = admin.post(`/api/servers/${serverId}/mods/install-pack`, {
            provider: "modrinth",
            projectId: PACK_PROJECT_ID,
            versionId: PACK_VERSION_ID,
            installId,
          });
          await sleep(1200);
          const stream = await openSse(
            `/api/servers/${serverId}/mods/install-progress?installId=${installId}`,
            admin
          ).done(20 * 60_000);
          const res = await post;
          expect(res.status === 200, `install-pack → ${res.status}: ${res.text.slice(0, 400)}`);
          const stages = stream.events.map((e) => e.stage);
          // The subscriber catches up to the CURRENT state only — the short
          // resolving/snapshot frames can fire before the subscription, so
          // assert the long-lived phases plus the terminal frame.
          expect(stages.includes("mods"), `SSE must carry the mods download stage (stages: ${stages.join(",")})`);
          expect(stages.includes("boot"), `SSE must carry the boot stage`);
          expect(stream.events.at(-1)?.stage === "done", `SSE terminal → ${stream.events.at(-1)?.stage}`);
          // The pack's message reports what the apply pass did — including
          // the client-only files it skipped.
          expect(
            /client-only skipped/i.test(res.body?.message ?? ""),
            `pack message must report exclusions → ${res.body?.message}`
          );
          expect((res.body?.warnings ?? []).length >= 1, "warnings must carry the boot-test runtime line");
        }
      );

      await step("the pack provisioned its pinned fabric loader", async () => {
        const res = await admin.get(`/api/servers/${serverId}/mods/loader`);
        expect(res.body?.loader?.type === "fabric", `loader type → ${res.body?.loader?.type}`);
        expect(
          res.body?.loader?.loaderVersion === PACK_FABRIC_PIN,
          `loader version → ${res.body?.loader?.loaderVersion}, want pack pin ${PACK_FABRIC_PIN}`
        );
        const mods = await admin.get(`/api/servers/${serverId}/mods`);
        const rows = mods.body?.mods ?? [];
        expect(rows.length >= 15, `pack install must produce real mod rows (${rows.length})`);
        const jars = fs.existsSync(modsDir(serverId)) ? fs.readdirSync(modsDir(serverId)) : [];
        expect(jars.filter((j) => j.endsWith(".jar")).length >= 15, `pack jars on disk (${jars.length})`);
      });

      await step("update-pack GET: the pack is recorded and updatable", async () => {
        const res = await admin.get(`/api/servers/${serverId}/mods/update-pack`);
        expect(res.status === 200, `GET update-pack → ${res.status}`);
        expect(res.body?.pack?.projectId === PACK_PROJECT_ID, `pack projectId → ${res.body?.pack?.projectId}`);
        expect(res.body?.pack?.kind === "mrpack", `pack kind → ${res.body?.pack?.kind}`);
        expect(res.body?.updatable === true, `updatable → ${res.body?.updatable}, want true`);
      });

      await step("re-importing the previous pack version retires its replacements", async () => {
        const mrpack = await downloadMrpack(OLDER_PACK_VERSION_ID);
        const res = await postMultipart(
          admin,
          `/api/servers/${serverId}/mods/import-modpack`,
          "modpack",
          { data: mrpack, filename: "adrenaline-older.mrpack", type: "application/octet-stream" }
        );
        expect(res.status === 200, `import-modpack → ${res.status}: ${res.text.slice(0, 400)}`);
        const warnings = res.body?.warnings ?? [];
        expect(
          warnings.some((w: string) => /from the previous pack install/.test(w)),
          `retirement warning missing → ${JSON.stringify(warnings).slice(0, 300)}`
        );
      });

      await step("update-pack on an imported pack is refused with guidance", async () => {
        const get = await admin.get(`/api/servers/${serverId}/mods/update-pack`);
        expect(get.body?.updatable === false, `updatable after import → ${get.body?.updatable}, want false`);
        const post = await admin.post(`/api/servers/${serverId}/mods/update-pack`, {});
        expect(post.status === 400, `POST update-pack → ${post.status}, want 400: ${post.text.slice(0, 200)}`);
        expect(
          /imported manually/.test(post.body?.error ?? ""),
          `refusal message → ${post.body?.error}`
        );
      });

      await step("a crash-jar in mods/ is quarantined while a real mod installs", async () => {
        fs.writeFileSync(path.join(modsDir(serverId), "e2ebomb.jar"), makeBombJar());
        const res = await admin.post(`/api/servers/${serverId}/mods/install`, {
          modType: "MODRINTH",
          modId: CARPET_PROJECT_ID,
          installId: `e2e-bomb-${Date.now()}`,
        });
        expect(res.status === 200, `install with bomb → ${res.status}: ${res.text.slice(0, 400)}`);
        const warnings: string[] = res.body?.warnings ?? [];
        expect(
          warnings.some((w: string) => /e2ebomb\.jar/.test(w)),
          `quarantine warning missing → ${JSON.stringify(warnings).slice(0, 400)}`
        );
        expect(
          !fs.existsSync(path.join(modsDir(serverId), "e2ebomb.jar")),
          "the bomb jar must be gone after quarantine"
        );
        const rows = await admin.get(`/api/servers/${serverId}/mods`);
        expect(
          (rows.body?.mods ?? []).some((m: any) => m.packageId === CARPET_PROJECT_ID),
          "the real mod must survive the quarantine round-trip"
        );
      });

      await step("the packed server boots to RUNNING and answers the live query ping", async () => {
        const start = await admin.post(`/api/servers/${serverId}/start`);
        expect(start.status === 200, `start → ${start.status}`);
        const server = await pollUntil(
          () => getServer(admin, serverId),
          (s) => s?.status === "RUNNING" || s?.status === "CRASHED",
          BOOT_TIMEOUT_MS,
          3000
        );
        expect(server?.status === "RUNNING", `packed server status → ${server?.status}`);
        expect(await tcpAccepts(server.port), `game port ${server.port} must accept`);
        const query = await pollUntil(
          () => admin.get(`/api/servers/${serverId}/query`),
          (r) => r.status === 200 && r.body?.status === "online",
          90_000,
          3000
        );
        expect(query.body?.status === "online", `query → ${query.body?.status}${query.body?.error ? ` (${query.body.error})` : ""}`);
        const stop = await admin.post(`/api/servers/${serverId}/stop`);
        expect(stop.status === 200, `stop → ${stop.status}`);
      });
    }
  ),

  scenario(
    "mods/curseforge-pack",
    "CurseForge install-pack (newest compatible file) + update-pack 'already newest' — self-skips when the app has no CurseForge key",
    ["heavy"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;

      let cfAvailable = false;
      await step("probe: the app can reach CurseForge", async () => {
        const probe = await admin.get(
          `/api/servers/${(ctx.state.packServerId as string) ?? ""}/mods/search?q=fabulously&type=modpacks`
        ).catch(() => ({ status: 0, body: null, text: "" }));
        const results = probe.body?.results ?? [];
        cfAvailable = results.some(
          (r: any) => r.provider === "curseforge" && /fabulously/i.test(r.name ?? "")
        );
        if (!cfAvailable) {
          console.log("      SKIP: no CurseForge key on the app (search returned no CF packs)");
        }
      });
      if (!cfAvailable) return;

      await step("fresh server boots vanilla once", async () => {
        const id = await createBootedServer(admin, "E2E CurseForge Pack", ctx);
        ctx.state.cfServerId = id;
      });
      const cfServerId = ctx.state.cfServerId as string;

      await step("install-pack resolves the newest compatible CurseForge file", async () => {
        const res = await admin.post(`/api/servers/${cfServerId}/mods/install-pack`, {
          provider: "curseforge",
          projectId: "396246", // Fabulously Optimized
        });
        expect(res.status === 200, `CF install-pack → ${res.status}: ${res.text.slice(0, 400)}`);
        expect(res.body?.success === true, `CF install success → ${res.body?.success}`);
      });

      await step("update-pack POST reports the pack is already newest", async () => {
        const get = await admin.get(`/api/servers/${cfServerId}/mods/update-pack`);
        expect(get.body?.pack?.kind === "curseforge", `pack kind → ${get.body?.pack?.kind}`);
        expect(get.body?.pack?.projectId === "396246", `pack projectId → ${get.body?.pack?.projectId}`);
        expect(get.body?.updatable === true, `updatable → ${get.body?.updatable}`);
        const post = await admin.post(`/api/servers/${cfServerId}/mods/update-pack`, {});
        expect(post.status === 200, `POST update-pack → ${post.status}: ${post.text.slice(0, 300)}`);
        expect(post.body?.updated === false, `updated → ${post.body?.updated}, want false`);
        expect(
          /already on the newest pack file/i.test(post.body?.message ?? ""),
          `message → ${post.body?.message}`
        );
      });
    }
  ),
];
