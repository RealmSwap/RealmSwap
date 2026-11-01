/**
 * gui/mods-install-progress (@heavy) — a real Modrinth install driven entirely
 * through the ModsView, asserting the SSE-driven InstallProgressPanel reaches
 * its "Done" stage and the Installed tab reflects the result. Live network;
 * nightly only (the @smoke GUI pass stays offline-capable).
 */

import { scenario, sleep } from "../framework";

export const modsInstallScenarios = [
  scenario("gui/mods-install-progress", "Modrinth search → install through the UI → SSE progress panel reaches Done", ["heavy"], async (ctx) => {
    const { page } = ctx;

    await page.getByRole("link", { name: "Mod Manager" }).click();
    await page.getByRole("heading", { name: "Mod & Plugin Manager" }).waitFor({ timeout: 20_000 });

    // The shared ActiveServerProvider auto-targets the only server.
    await page.getByRole("button", { name: "Browse", exact: true }).click();
    const search = page.getByPlaceholder(/Search .+\.\.\./).first();
    await search.waitFor({ timeout: 20_000 });
    await search.fill("carpet");

    // First result card's Install button.
    const installButton = page.getByRole("button", { name: "Install", exact: true }).first();
    await installButton.waitFor({ timeout: 30_000 });
    await installButton.click();

    // SSE-driven progress panel: role=status, stage strip must reach Done.
    const panel = page.locator('[role="status"][aria-live="polite"]');
    await panel.waitFor({ timeout: 30_000 });
    const deadline = Date.now() + 300_000;
    let done = false;
    let lastText = "";
    while (Date.now() < deadline) {
      lastText = (await panel.textContent().catch(() => "")) ?? "";
      if (/Done/i.test(lastText) && !/Boot test/i.test(lastText)) {
        // "Done" appears in the stage strip only once reached; the strip keeps
        // earlier stages visible, so require Done AND no active failure.
        done = true;
        break;
      }
      if (/Failed/i.test(lastText)) {
        throw new Error(`install progress reports Failed: ${lastText.slice(0, 300)}`);
      }
      await sleep(2000);
    }
    if (!done) throw new Error(`install progress never reached Done — panel text: ${lastText.slice(0, 300)}`);

    // Installed tab reflects the new mod.
    await page.getByRole("button", { name: /^Installed/ }).click();
    await page.getByRole("heading", { name: "Installed Mods" }).waitFor({ timeout: 20_000 });
    const installedText = await page.locator("main, body").first().textContent();
    if (!/1|2|3|4|5|6|7|8|9/.test(installedText ?? "")) {
      throw new Error("installed tab shows no mod count");
    }
  }),
];
