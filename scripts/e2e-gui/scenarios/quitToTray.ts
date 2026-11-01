/**
 * gui/close-to-tray-and-quit (runs LAST) — sign out through the UI, then the
 * Electron shell behaviors: closing the window hides to the tray (app keeps
 * running), and File → Quit (the same handler the tray uses) exits the
 * process cleanly.
 */

import { dismissCelebrationIfPresent, scenario } from "../framework";
import { quitViaMenu, waitForExit } from "../electron";
import { QUIT_TIMEOUT_MS } from "../config";

export const teardownQuitScenarios = [
  scenario("gui/close-to-tray-and-quit", "sign out; window close hides to tray; File → Quit exits", ["smoke"], async (ctx) => {
    const { page, electronApp } = ctx;

    // Sign out → back at the login page.
    await dismissCelebrationIfPresent(page);
    await page.locator('[aria-label="Sign out"]').click();
    await page.getByRole("heading", { name: "Welcome Back" }).waitFor({ timeout: 20_000 });

    // Close-to-tray: the window hides, the app keeps running.
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) throw new Error("no BrowserWindow to close");
      win.close();
    });
    const stillVisible = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win ? win.isVisible() : null;
    });
    if (stillVisible !== false) {
      throw new Error(`window should hide to tray on close, isVisible=${stillVisible}`);
    }
    // The main process answering this evaluate IS the liveness proof —
    // window-all-closed deliberately does nothing (close-to-tray).
    const stillAlive = await electronApp.evaluate(({ app }) => app.getAppMetrics().length >= 0);
    if (!stillAlive) throw new Error("app quit on window close — close-to-tray is broken");

    // File → Quit exercises beginQuit → app.quit → (packaged: before-quit
    // stopAllServers) — the same path as the tray's Quit item.
    await quitViaMenu(electronApp);
    await waitForExit(electronApp, QUIT_TIMEOUT_MS);
  }),
];
