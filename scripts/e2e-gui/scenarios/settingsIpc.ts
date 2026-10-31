/**
 * gui/settings-and-ipc — settings page sections render, and the ONLY preload
 * bridge (window.realmswapDesktop launch-on-boot pair) round-trips through
 * IPC. In dev builds the honest answer is supported:false and the Dedicated
 * Box card says so instead of rendering a fake toggle; the packaged pass
 * (run --packaged) covers the supported:true toggle round-trip.
 */

import { dismissCelebrationIfPresent, scenario } from "../framework";

export const settingsIpcScenarios = [
  scenario("gui/settings-and-ipc", "settings sections render; launch-on-boot IPC bridge answers", ["smoke"], async (ctx) => {
    const { page, electronApp } = ctx;

    await dismissCelebrationIfPresent(page);
    await page.locator('[aria-label="Account settings"]').click();
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor({ timeout: 20_000 });
    await page.getByRole("heading", { name: "Discord Integration", exact: true }).waitFor({ timeout: 10_000 });
    await page.getByRole("heading", { name: "Notifications", exact: true }).waitFor({ timeout: 10_000 });
    await page.getByRole("heading", { name: "Dedicated Box", exact: true }).waitFor({ timeout: 10_000 });

    // Dev electron: the bridge must honestly report unsupported, and the UI
    // must render the "available in the desktop app" text instead of a toggle.
    const bridge = await page.evaluate(() => {
      const desktop = (window as any).realmswapDesktop;
      if (!desktop) throw new Error("preload bridge window.realmswapDesktop missing");
      return desktop.getLaunchOnBoot();
    });
    if (bridge.supported !== false) {
      throw new Error(`dev build should report launch-on-boot supported:false, got ${JSON.stringify(bridge)}`);
    }
    await page
      .getByText("Available in the RealmSwap desktop app. Running from a browser? Keep RealmSwap running by hand.")
      .waitFor({ timeout: 10_000 });

    void electronApp;
  }),
];
