/**
 * All-games CRUD sweep (@heavy) — the test plan's "server CRUD for all 11
 * games". Every built-in definition gets a real create through
 * POST /api/servers, asserted against its OWN spec from GET /api/definitions:
 * game slug, default port, the config surface implied by editableConfigPath
 * (file round-trip for editable games, the honest "command-line arguments"
 * contract for the rest), then a clean archive. No game processes are
 * started — real installs for the Steam titles are Windows territory (the
 * plan's Layer 3/4); this proves every game's definition + CRUD surface is
 * wired, not just Minecraft's.
 */

import fs from "fs";
import path from "path";
import { expect } from "../client";
import { DATA_DIR } from "../config";
import { scenario, step, type ScenarioContext } from "./framework";

/** Every built-in game the product ships (src/lib/definitions/builtins.ts). */
const BUILT_IN_SLUGS = [
  "MINECRAFT",
  "VALHEIM",
  "ENSHROUDED",
  "ZOMBOID",
  "ARK",
  "TERRARIA",
  "PALWORLD",
  "RUST",
  "WINDROSE",
  "SATISFACTORY",
  "VRISING",
];

function configFormatFor(relPath: string): string {
  const filename = relPath.split("/").pop() || relPath;
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return ext === "properties" || ext === "json" || ext === "ini" || ext === "cfg"
    ? ext
    : "text";
}

export const gamesScenarios = [
  scenario(
    "games/all-games-crud",
    "create+config+archive for every built-in definition, each asserted against its own spec",
    ["heavy"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;

      let builtins: any[] = [];
      await step("definitions list carries every built-in game", async () => {
        const res = await admin.get("/api/definitions");
        expect(res.status === 200, `GET /api/definitions → ${res.status}`);
        builtins = (res.body?.definitions ?? []).filter((d: any) => d.isBuiltIn && !d.ownerId);
        const slugs = new Set(builtins.map((d: any) => d.slug));
        const missing = BUILT_IN_SLUGS.filter((s) => !slugs.has(s));
        expect(missing.length === 0, `missing built-in definitions: ${missing.join(", ")}`);
        for (const def of builtins) {
          expect(
            def.spec?.defaultPort > 0,
            `${def.slug} spec.defaultPort → ${def.spec?.defaultPort}, want > 0`
          );
        }
      });

      // No password is sent anywhere: both built-in password policies
      // (VALHEIM, PALWORLD) define fallbacks the server applies itself.
      for (const def of builtins) {
        const slug = def.slug;
        let serverId = "";

        await step(`${slug}: create honors the spec (game, default port, STOPPED)`, async () => {
          const res = await admin.post("/api/servers", {
            name: `E2E ${slug}`,
            definitionId: def.id,
            ramAllocation: Math.max(2, def.recommendedRamGB || 2),
          });
          expect(res.status === 201, `${slug} create → ${res.status}: ${res.text.slice(0, 300)}`);
          expect(res.body?.status === "STOPPED", `${slug} status → ${res.body?.status}, want STOPPED`);
          expect(res.body?.game === slug, `${slug} game → ${res.body?.game}`);
          expect(
            res.body?.port === def.spec.defaultPort,
            `${slug} port → ${res.body?.port}, want spec default ${def.spec.defaultPort}`
          );
          serverId = res.body.id;
        });

        await step(`${slug}: config surface matches editableConfigPath`, async () => {
          const res = await admin.get(`/api/servers/${serverId}/config`);
          expect(res.status === 200, `${slug} GET config → ${res.status}: ${res.text.slice(0, 200)}`);
          if (def.spec.editableConfigPath) {
            const expectedFilename = def.spec.editableConfigPath.split("/").pop();
            expect(res.body?.editable === true, `${slug} config editable → ${res.body?.editable}`);
            expect(res.body?.filename === expectedFilename, `${slug} config filename → ${res.body?.filename}, want ${expectedFilename}`);
            expect(
              res.body?.format === configFormatFor(def.spec.editableConfigPath),
              `${slug} config format → ${res.body?.format}`
            );
            expect(
              (res.body?.content ?? "").includes("not yet generated"),
              `${slug} uninstalled config content should be the honest placeholder`
            );

            const marker = `# e2e-games marker for ${slug}\n`;
            const put = await admin.put(`/api/servers/${serverId}/config`, { content: marker });
            expect(put.status === 200, `${slug} PUT config → ${put.status}: ${put.text.slice(0, 200)}`);
            const reread = await admin.get(`/api/servers/${serverId}/config`);
            expect(reread.body?.content === marker, `${slug} config round-trip lost the write`);
            const onDisk = path.join(DATA_DIR, "local-servers", serverId, def.spec.editableConfigPath);
            expect(fs.existsSync(onDisk), `${slug} PUT must create the config file on disk`);
            expect(fs.readFileSync(onDisk, "utf8") === marker, `${slug} disk content diverges from the API`);
          } else {
            expect(res.body?.editable === false, `${slug} has no editableConfigPath — config must say not editable`);
            expect(
              (res.body?.message ?? "").includes("command-line arguments"),
              `${slug} not-editable message should explain the command-line contract`
            );
            const put = await admin.put(`/api/servers/${serverId}/config`, { content: "x" });
            expect(put.status === 400, `${slug} PUT config on a non-editable game → ${put.status}, want 400`);
          }
        });

        await step(`${slug}: archive removes it cleanly`, async () => {
          const res = await admin.post(`/api/servers/${serverId}/archive`);
          expect(res.status === 200, `${slug} archive → ${res.status}: ${res.text.slice(0, 300)}`);
          expect(
            !fs.existsSync(path.join(DATA_DIR, "local-servers", serverId)),
            `${slug} server dir must leave local-servers after archiving`
          );
          const list = await admin.get("/api/servers");
          expect(
            !(list.body?.servers ?? []).some((s: any) => s.id === serverId),
            `${slug} server must be gone from the list after archiving`
          );
        });
      }

      await step("two stopped servers of one game can share the spec port (bind-based check)", async () => {
        const mc = builtins.find((d: any) => d.slug === "MINECRAFT");
        const ids: string[] = [];
        for (const name of ["E2E Port Share A", "E2E Port Share B"]) {
          const res = await admin.post("/api/servers", {
            name,
            definitionId: mc.id,
            ramAllocation: 2,
          });
          expect(res.status === 201, `${name} create → ${res.status}: ${res.text.slice(0, 200)}`);
          expect(res.body?.port === mc.spec.defaultPort, `${name} port → ${res.body?.port}`);
          ids.push(res.body.id);
        }
        // Stopped servers never bind their port, so the create-time
        // availability check is bind-based, not ownership-based.
        for (const id of ids) {
          const res = await admin.post(`/api/servers/${id}/archive`);
          expect(res.status === 200, `port-share archive ${id} → ${res.status}`);
        }
      });
    }
  ),
];
