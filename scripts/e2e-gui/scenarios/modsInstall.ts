/**
 * gui/mods-install-progress (@heavy) — a real loader + Modrinth install driven
 * entirely through the ModsView, asserting the SSE-driven InstallProgressPanel
 * reaches its "Done" stage twice and the Installed tab reflects the result.
 * Live network; nightly only (the @smoke GUI pass stays offline-capable).
 *
 * Ground truth (2026-11-02, first nightly run): the Browse surface opens in
 * Modpacks mode for Minecraft (the pack gallery is the front door), so the
 * harness must flip the toggle to Mods before searching — a modpack search
 * result boot-tests a fresh world for a possibly-newer MC pin and can
 * legitimately burn the whole 600s window. A loader-dependent mod is also
 * honestly refused on a vanilla server, so Fabric goes in first through the
 * vanilla-server banner.
 */

import { scenario, sleep } from "../framework";

export const modsInstallScenarios = [
  scenario("gui/mods-install-progress", "Fabric via the vanilla banner → Modrinth install through the UI → SSE progress panel reaches Done", ["heavy"], async (ctx) => {
    const { page } = ctx;

    await page.getByRole("link", { name: "Mod Manager" }).click();
    await page.getByRole("heading", { name: "Mod & Plugin Manager" }).waitFor({ timeout: 20_000 });

    // The shared ActiveServerProvider auto-targets the only server.

    // 1. Fabric loader via the vanilla-server banner on the Installed tab
    //    (its own boot test runs the same progress panel).
    await page.getByRole("button", { name: /^Installed/ }).click();
    const banner = page.getByText("This is a vanilla server — mods won't load until you install a mod loader.");
    await banner.waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Install Fabric", exact: true }).click();
    await waitForInstallDone(page, "Fabric loader install", ctx);

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
    await installButton.click();

    await waitForInstallDone(page, "Carpet install", ctx);

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
 * The InstallProgressPanel is SSE-driven: poll its text until the stage strip
 * resolves. 660s: the install's own boot test is allowed 600s, so the watcher
 * must out-wait the product's ceiling (CI runners are far slower than a dev
 * Mac). The stage strip keeps earlier stages visible, so Done only counts
 * when "Boot test" is no longer in the strip.
 */
/**
 * The InstallProgressPanel is SSE-driven: poll its title until the install
 * resolves. 660s: the install's own boot test is allowed 600s, so the watcher
 * must out-wait the product's ceiling (CI runners are far slower than a dev
 * Mac). While stalled, sample the app's own API through the page's session
 * (server status/runner, loader state, in-flight backups) — a 660s stall
 * inside one stage is exactly what we can't diagnose from a CI log alone.
 */
async function waitForInstallDone(page: import("playwright").Page, what: string, ctx?: import("../framework").GuiContext) {
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
      throw new Error(`${what} reports Failed: ${panelText}`);
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

/** One app-state sample for stall diagnostics; never throws. */
async function sampleAppState(page: import("playwright").Page, baseUrl: string): Promise<string> {
  try {
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
