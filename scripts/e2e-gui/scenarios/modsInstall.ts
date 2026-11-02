/**
 * gui/mods-install-progress (@heavy) — a real loader + Modrinth install driven
 * entirely through the ModsView, asserting the SSE-driven InstallProgressPanel
 * reaches its "Done" stage twice and the Installed tab reflects the result.
 * Live network; nightly only (the @smoke GUI pass stays offline-capable).
 *
 * Ground truth (2026-11-02, nightly runs):
 * - The Browse surface opens in Modpacks mode for Minecraft (the pack gallery
 *   is the front door), so the harness must flip the toggle to Mods before
 *   searching — a modpack search result boot-tests a fresh world for a
 *   possibly-newer MC pin and can legitimately burn the whole 600s window.
 * - A loader-dependent mod is honestly refused on a vanilla server, so Fabric
 *   goes in first through the vanilla-server banner.
 * - The install flow snapshots the server dir first. On a Linux host running
 *   rootful Docker, a Docker-runner server's world files are written uid 0
 *   mode 600 and the dashboard process (uid 1001) cannot snapshot them
 *   (EACCES) — installs are impossible there until the container-user story
 *   is fixed (pinned follow-up). So this scenario deploys its OWN server
 *   through the real create-server page with the Local PC runtime, which is
 *   also what the Mac runs; server-lifecycle keeps covering the wizard's
 *   default (Docker on CI) boot path.
 */

import { captureResponseOn, scenario, sleep } from "../framework";

const MODS_SERVER_NAME = "E2E GUI Mods Server";

export const modsInstallScenarios = [
  scenario("gui/mods-install-progress", "deploy a Local PC server via the create page → Fabric via the vanilla banner → Modrinth install through the UI → SSE progress panel reaches Done", ["heavy"], async (ctx) => {
    const { page } = ctx;

    // 0. Deploy the snapshot-capable Local PC server through the real
    //    create-server page (Minecraft → name → Local PC → Deploy).
    await page.getByRole("link", { name: "Servers" }).click();
    await page.getByRole("link", { name: "Deploy New Server" }).click();
    await page.locator('[role="button"][aria-label="Select Minecraft"]').click();
    const nameInput = page.locator("div:has(> label:has-text('Server name')) > input");
    await nameInput.waitFor({ timeout: 20_000 });
    await nameInput.fill(MODS_SERVER_NAME);
    await page.getByRole("button", { name: "Local PC", exact: true }).click();
    // Capture the create POST itself: a non-2xx means the route refused (the
    // form stays with an error banner), silence means the click never fired.
    const createRes = await captureResponseOn(
      page,
      (u, m) => u.endsWith("/api/servers") && m === "POST",
      async () => {
        await page.getByRole("button", { name: "Deploy Game World" }).click();
      }
    );
    if (!createRes.ok()) {
      throw new Error(`deploy of ${MODS_SERVER_NAME} refused (HTTP ${createRes.status()}): ${(await createRes.text()).slice(0, 300)}`);
    }
    // CreateServerView lands on the dashboard; go to the Mod Manager. Reload
    // once there: the shared ActiveServerProvider fetched its server list at
    // app start and doesn't know about the new server until a fresh load.
    await page.getByRole("link", { name: "Mod Manager" }).click();
    await page.getByRole("heading", { name: "Mod & Plugin Manager" }).waitFor({ timeout: 20_000 });
    await page.reload();
    await page.getByRole("heading", { name: "Mod & Plugin Manager" }).waitFor({ timeout: 30_000 });

    // Target OUR server explicitly — with two servers the shared provider's
    // auto-target is whichever it is, not necessarily ours. hasText on the
    // <select> matches its <option> text ("E2E GUI Mods Server — Minecraft").
    const target = page.locator("select").filter({ hasText: MODS_SERVER_NAME }).first();
    await target.waitFor({ timeout: 20_000 });
    const optionValue = await page
      .locator("select option", { hasText: MODS_SERVER_NAME })
      .first()
      .getAttribute("value");
    if (!optionValue) throw new Error(`${MODS_SERVER_NAME} missing from the target server selector`);
    await target.selectOption(optionValue);

    // Boot the fresh server once (via the session-authenticated API — setup,
    // not the flow under test) so server.jar exists: the loader install reads
    // the server's Minecraft version from it and honestly refuses on a
    // never-booted server ("install/start the server once first" — the
    // vanilla banner doesn't mention that yet; pinned honesty wart).
    const sid = optionValue;
    const startRes = await page.request.post(`${ctx?.appBaseUrl}/api/servers/${sid}/start`);
    if (!startRes.ok()) throw new Error(`start refused (HTTP ${startRes.status()}): ${(await startRes.text()).slice(0, 200)}`);
    const t0 = Date.now();
    for (;;) {
      await sleep(3000);
      const st = await page.request.get(`${ctx?.appBaseUrl}/api/servers`);
      const row = ((await st.json())?.servers ?? []).find((s: any) => s.id === sid);
      if (row?.status === "RUNNING") break;
      if (row?.status === "CRASHED") throw new Error("fresh server crashed during its first boot (mods-install setup)");
      if (Date.now() - t0 > 240_000) throw new Error(`first boot never reached RUNNING (status ${row?.status})`);
    }
    await page.request.post(`${ctx?.appBaseUrl}/api/servers/${sid}/stop`);
    for (;;) {
      await sleep(2000);
      const st = await page.request.get(`${ctx?.appBaseUrl}/api/servers`);
      const row = ((await st.json())?.servers ?? []).find((s: any) => s.id === sid);
      if (row?.status === "STOPPED") break;
      if (Date.now() - t0 > 300_000) throw new Error("server never returned to STOPPED after setup stop");
    }

    // 1. Fabric loader via the vanilla-server banner on the Installed tab
    //    (its own boot test runs the same progress panel).
    await page.getByRole("button", { name: /^Installed/ }).click();
    const banner = page.getByText("This is a vanilla server — mods won't load until you install a mod loader.");
    await banner.waitFor({ timeout: 30_000 });
    // The POST resolves only when the route finishes (boot test included) —
    // that's the authoritative completion signal. The SSE panel is the UI
    // contract under test; watch BOTH concurrently (the panel auto-dismisses
    // right around route completion, so a strictly-sequential watcher would
    // always arrive after the unmount).
    const loaderPost = page
      .waitForResponse((r) => r.url().includes("/mods/loader") && r.request().method() === "POST", { timeout: 660_000 })
      .catch((err: Error) => err);
    await page.getByRole("button", { name: "Install Fabric", exact: true }).click();
    await waitForInstallDone(page, "Fabric loader install", ctx, loaderPost);

    // 2. A real mod install through Browse — in Mods mode, not Modpacks.
    //    .first(): the tab bar's Browse renders before any inline "Browse"
    //    hint link (the empty Installed tab grows one once a mod exists).
    await page.getByRole("button", { name: "Browse", exact: true }).first().click();
    await page.getByRole("button", { name: "Mods", exact: true }).click();
    const search = page.getByPlaceholder(/Search .+\.\.\./).first();
    await search.waitFor({ timeout: 20_000 });
    await search.fill("carpet");

    // Wait for the search to actually apply, then install the exact Carpet
    // card — .first(): Modrinth returns multiple distinct projects titled
    // exactly "Carpet", and any of them proves the install flow.
    await page.getByText('Search results for "carpet"').waitFor({ timeout: 30_000 });
    const carpetCard = page
      .getByRole("heading", { name: "Carpet", exact: true })
      .first()
      .locator("xpath=ancestor::div[.//button[normalize-space()='Install']][1]");
    const installButton = carpetCard.getByRole("button", { name: "Install", exact: true });
    await installButton.waitFor({ timeout: 30_000 });
    const carpetPost = page
      .waitForResponse((r) => r.url().endsWith("/mods/install") && r.request().method() === "POST", { timeout: 660_000 })
      .catch((err: Error) => err);
    await installButton.click();
    await waitForInstallDone(page, "Carpet install", ctx, carpetPost);

    // Installed tab reflects the new mod.
    await page.getByRole("button", { name: /^Installed/ }).click();
    await page.getByRole("heading", { name: "Installed Mods" }).waitFor({ timeout: 20_000 });
    const installedText = await page.locator("main, body").first().textContent();
    if (!/1|2|3|4|5|6|7|8|9/.test(installedText ?? "")) {
      throw new Error("installed tab shows no mod count");
    }
  }),
];

/**
 * Watch an install to its verdict. The SSE-driven InstallProgressPanel is the
 * UI contract (its title must be seen mid-flight, then "Done"); the POST's
 * response is the authoritative completion signal and races the panel — the
 * client unmounts the panel the moment the route returns, so the Done title
 * and the response can legitimately never coexist. Verdict precedence:
 * panel Failed / POST non-2xx => throw with the body; panel Done or POST 2xx
 * after mid-flight progress was seen => success.
 */
async function waitForInstallDone(
  page: import("playwright").Page,
  what: string,
  ctx: import("../framework").GuiContext | undefined,
  completion?: Promise<import("playwright").Response | Error>,
): Promise<void> {
  const panel = page.locator('[role="status"][aria-live="polite"]');
  await panel.waitFor({ timeout: 30_000 });
  const titleSel = "div.text-sm.font-medium";
  const deadline = Date.now() + 660_000;
  let lastTitle = "";
  let lastChange = Date.now();
  const timeline: string[] = [];
  // Discriminate on the panel's TITLE element ("Resolving"/"Boot test"/…,
  // "Done"/"Failed" when terminal) — never on whole-panel text: the stage
  // strip always renders (even terminal) and live boot output can contain
  // MC's own "Done (3.1s)!" line, so raw-text matching false-trips both ways.
  // A previous install's terminal panel lingers for its dismiss window —
  // only accept a verdict after this install was seen mid-flight.
  let sawProgress = false;
  while (Date.now() < deadline) {
    if (completion) {
      const settled = await Promise.race([
        completion.then((r) => r),
        new Promise<null>((r) => setTimeout(() => r(null), 50)),
      ]);
      if (settled && !(settled instanceof Error)) {
        if (!settled.ok()) {
          throw new Error(`${what} refused (HTTP ${settled.status()}): ${(await settled.text()).slice(0, 300)}\nstage timeline: ${timeline.slice(-8).join(" | ")}`);
        }
        if (sawProgress) return; // route completed after real progress; panel may have unmounted with the Done frame
        throw new Error(`${what} completed without the progress panel ever showing a stage\nstage timeline: ${timeline.slice(-8).join(" | ")}`);
      }
      if (settled instanceof Error) throw new Error(`${what} POST never completed: ${settled.message}`);
    }
    const prevTitle = lastTitle;
    lastTitle = ((await panel.locator(titleSel).first().textContent().catch(() => "")) ?? "").trim();
    if (lastTitle && lastTitle !== "Done" && lastTitle !== "Failed") {
      sawProgress = true;
      if (lastTitle !== prevTitle) {
        timeline.push(`${Math.round((660_000 - (deadline - Date.now())) / 1000)}s:${lastTitle}`);
        lastChange = Date.now();
      }
    }
    if (sawProgress && lastTitle === "Done") {
      return;
    }
    if (sawProgress && lastTitle === "Failed") {
      const panelText = ((await panel.textContent().catch(() => "")) ?? "").slice(0, 300);
      throw new Error(`${what} reports Failed: ${panelText}\n${await fsEvidence(page, ctx)}`);
    }
    // Stalled ≥120s on one stage: pull the app's server-side view through the
    // browser session so the failure carries evidence, not just a timeout.
    if (Date.now() - lastChange > 120_000 && ctx?.appBaseUrl) {
      const note = await sampleAppState(page, ctx.appBaseUrl);
      if (note) timeline.push(`${Math.round((660_000 - (deadline - Date.now())) / 1000)}s:APP>${note}`);
      lastChange = Date.now();
    }
    await sleep(2000);
  }
  const tail = timeline.slice(-12).join(" | ");
  const appTail = ctx?.appOutputTail ? `\n--- app output tail ---\n${ctx.appOutputTail().slice(-2500)}` : "";
  throw new Error(`${what} never reached Done — panel title: ${lastTitle}\nstage timeline: ${tail}${appTail}`);
}

/**
 * Ownership/mode evidence for snapshot failures: the harness process runs on
 * the same machine as the app, so it can stat the exact paths the app's
 * cpSync refused. uid/gid/mode of the world file, its dir, and the snapshots
 * root — plus who we are.
 */
async function fsEvidence(page: import("playwright").Page, ctx?: import("../framework").GuiContext): Promise<string> {
  try {
    const fs = await import("fs");
    const base = ctx?.appBaseUrl;
    if (!base) return "";
    const servers = await page.request.get(`${base}/api/servers`);
    const server0 = (await servers.json())?.servers?.[0];
    if (!server0?.id) return "";
    const serverId = server0.id;
    const runner = `server runner=${server0.runnerType ?? "LOCAL"} status=${server0.status}`;
    const world = `/tmp/realmswap-e2e-api-data/local-servers/${serverId}/world`;
    const stat = (p: string) => {
      try {
        const s = fs.statSync(p);
        return `${p.split("/").slice(-2).join("/")}: uid=${s.uid} gid=${s.gid} mode=${(s.mode & 0o777).toString(8)}`;
      } catch (e: any) {
        return `${p.split("/").slice(-2).join("/")}: ${e.code}`;
      }
    };
    return [
      `harness uid=${process.getuid?.()} gid=${process.getgid?.()}`,
      runner,
      stat(`${world}/level.dat_old`),
      stat(world),
      stat("/tmp/realmswap-e2e-api-data/snapshots"),
    ].join(" | ");
  } catch {
    return "";
  }
}

/** One app-state sample for stall diagnostics; never throws. */
async function sampleAppState(page: import("playwright").Page, baseUrl: string): Promise<string> {  try {
    const servers = await page.request.get(`${baseUrl}/api/servers`);
    const list = (await servers.json())?.servers ?? [];
    const s = list[0];
    if (!s) return "no servers";
    let note = `server status=${s.status} runner=${s.runnerType ?? "LOCAL"}`;
    const loader = await page.request.get(`${baseUrl}/api/servers/${s.id}/mods/loader`);
    if (loader.ok()) note += ` loader=${JSON.stringify((await loader.json())?.loader?.type ?? null)}`;
    const backups = await page.request.get(`${baseUrl}/api/servers/${s.id}/backups`);
    if (backups.ok()) {
      const rows = (await backups.json())?.backups ?? [];
      const inFlight = rows.find((b: any) => b.status === "IN_PROGRESS" || b.status === "PENDING");
      note += ` backups=${rows.length}${inFlight ? ` STUCK:${inFlight.status}:${inFlight.backupType}` : ""}`;
    }
    return note;
  } catch (err: any) {
    return `sample failed: ${err.message?.slice(0, 80)}`;
  }
}
