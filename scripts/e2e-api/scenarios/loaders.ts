/**
 * Loader matrix (@heavy) — installs each real mod loader on its own fresh
 * Minecraft server and lets the route's post-install boot test prove the
 * loader actually launches the server (applyLoaderLaunch is consumed by the
 * sandbox boot, exactly as it is on real Start).
 *
 * Fabric/Quilt/Forge get real installs + boot tests. NeoForge is asserted as
 * the honest refusal it currently is: every NeoForge build for this
 * definition's Minecraft (26.2) is a -beta, the installer only picks stable
 * builds, so the route answers 500 "No NeoForge build is available…". When
 * NeoForge ships a stable 26.2 build this step flips to a real install.
 */

import fs from "fs";
import path from "path";
import { expect } from "../client";
import { BOOT_TIMEOUT_MS, DATA_DIR } from "../config";
import { pollUntil, scenario, step, type ScenarioContext } from "./framework";

const LOADERS = ["fabric", "forge"] as const;

function getServer(admin: import("../client").ApiClient, id: string): Promise<any | null> {
  return admin.get("/api/servers").then((res) => {
    if (res.status !== 200) throw new Error(`GET /api/servers → ${res.status}`);
    return (res.body?.servers ?? []).find((s: any) => s.id === id) ?? null;
  });
}

export const loaderScenarios = [
  scenario(
    "mods/loader-matrix",
    "fabric + forge install with post-install boot tests on fresh servers; quilt's launcher crash caught + rolled back; neoforge refused honestly (no stable 26.2 build yet)",
    ["heavy"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      const definitionId = ctx.state.definitionId as string;
      expect(!!definitionId, "Minecraft definition must exist (auth scenario seeds state)");

      for (const loader of LOADERS) {
        await step(`${loader}: fresh server boots vanilla once`, async () => {
          const res = await admin.post("/api/servers", {
            name: `E2E Loader ${loader}`,
            definitionId,
            ramAllocation: 2,
          });
          expect(res.status === 201, `create → ${res.status}: ${res.text.slice(0, 200)}`);
          const serverId = res.body.id;
          ctx.state[`${loader}ServerId`] = serverId;

          const start = await admin.post(`/api/servers/${serverId}/start`);
          expect(start.status === 200, `start → ${start.status}: ${start.text.slice(0, 200)}`);
          const server = await pollUntil(
            () => getServer(admin, serverId),
            (s) => s?.status === "RUNNING" || s?.status === "CRASHED",
            BOOT_TIMEOUT_MS,
            3000
          );
          expect(server?.status === "RUNNING", `${loader} base server status → ${server?.status}`);
          const stop = await admin.post(`/api/servers/${serverId}/stop`);
          expect(stop.status === 200, `stop → ${stop.status}`);
        });

        await step(`${loader}: install passes the loader boot test`, async () => {
          const serverId = ctx.state[`${loader}ServerId`] as string;
          const res = await admin.post(`/api/servers/${serverId}/mods/loader`, { loader });
          expect(res.status === 200, `POST loader ${loader} → ${res.status}: ${res.text.slice(0, 300)}`);
          expect(res.body?.loader?.type === loader, `marker type → ${res.body?.loader?.type}`);
          expect(
            res.body?.loader?.minecraftVersion === "26.2",
            `marker mcVersion → ${res.body?.loader?.minecraftVersion}`
          );
          expect(!!res.body?.loader?.launch, "marker must carry the launch plan (applyLoaderLaunch)");
          expect(
            fs.existsSync(path.join(DATA_DIR, "local-servers", serverId, "realmswap-loader.json")),
            "realmswap-loader.json persisted"
          );
          const mods = await admin.get(`/api/servers/${serverId}/mods`);
          expect(mods.status === 200, `GET mods → ${mods.status}`);
          expect((mods.body?.mods ?? []).length === 0, "a bare loader install adds no mod rows");
        });
      }

      await step(
        "quilt: the boot test catches its launcher crash and rolls back honestly",
        async () => {
          // Ground truth (2026-10-31): every Quilt loader build for MC 26.2 is
          // a beta whose QuiltServerLauncher dies on this Java era
          // ("… occurred when launching the server! … QuiltServerLauncher.main"),
          // while fabric/forge launch fine. The route must not pretend: the
          // post-install boot test catches the crash, the snapshot rolls the
          // server back to vanilla, and the caller gets the 500. When Quilt
          // ships a launchable 26.2 build this step fails and flips to a real
          // install like fabric/forge above.
          const res = await admin.post("/api/servers", {
            name: "E2E Loader quilt",
            definitionId,
            ramAllocation: 2,
          });
          expect(res.status === 201, `create quilt server → ${res.status}`);
          const serverId = res.body.id;
          ctx.state.quiltServerId = serverId;
          const start = await admin.post(`/api/servers/${serverId}/start`);
          expect(start.status === 200, `start → ${start.status}`);
          const server = await pollUntil(
            () => getServer(admin, serverId),
            (s) => s?.status === "RUNNING" || s?.status === "CRASHED",
            BOOT_TIMEOUT_MS,
            3000
          );
          expect(server?.status === "RUNNING", `quilt base server status → ${server?.status}`);
          await admin.post(`/api/servers/${serverId}/stop`);

          const install = await admin.post(`/api/servers/${serverId}/mods/loader`, { loader: "quilt" });
          expect(install.status === 500, `POST loader quilt → ${install.status}, want 500: ${install.text.slice(0, 200)}`);
          expect(
            /rolled back|crashed/i.test(install.body?.error ?? ""),
            `quilt failure message → ${install.body?.error}`
          );
          if (install.body?.bootOutput) {
            console.log(
              `      [record] quilt boot tail: ${String(install.body.bootOutput).slice(-400).replace(/\s+/g, " ")}`
            );
          }
          const marker = await admin.get(`/api/servers/${serverId}/mods/loader`);
          expect(marker.body?.loader === null, `marker after rollback → ${JSON.stringify(marker.body?.loader)}, want null`);
          expect(
            !fs.existsSync(path.join(DATA_DIR, "local-servers", serverId, "realmswap-loader.json")),
            "rollback must remove realmswap-loader.json"
          );
          const mods = await admin.get(`/api/servers/${serverId}/mods`);
          expect((mods.body?.mods ?? []).length === 0, "rollback must leave no mod rows");
        }
      );

      await step("fabric: installing a second loader type is refused", async () => {
        const serverId = ctx.state.fabricServerId as string;
        const res = await admin.post(`/api/servers/${serverId}/mods/loader`, { loader: "quilt" });
        expect(res.status === 400, `loader switch → ${res.status}, want 400: ${res.text.slice(0, 200)}`);
        expect(
          /loader|snapshot/i.test(res.body?.error ?? ""),
          `switch refusal message → ${res.body?.error}`
        );
      });

      await step("neoforge: refused while every 26.2 build is a beta", async () => {
        // The quilt server is vanilla again after its rollback — no marker,
        // so version resolution runs and finds no stable NeoForge build.
        const res = await admin.post(`/api/servers/${ctx.state.quiltServerId}/mods/loader`, {
          loader: "neoforge",
        });
        expect(res.status === 500, `neoforge install → ${res.status}, want 500: ${res.text.slice(0, 200)}`);
        expect(
          /No NeoForge build is available/i.test(res.body?.error ?? ""),
          `neoforge refusal message → ${res.body?.error}`
        );
      });
    }
  ),
];
