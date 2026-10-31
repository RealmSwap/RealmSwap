/**
 * Electron launch + interaction helpers for the GUI harness. All launches set
 * GAMEVAULT_TEST_HARNESS=1 (main.js skips protocol registration) and sandbox
 * off under CI (E2E_GUI_NO_SANDBOX=1 — the xvfb runner has no user-namespace
 * sandbox support).
 */

import path from "path";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { ADMIN_USER, REPO_ROOT } from "../e2e-api/config";

export function harnessEnv(overrides: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, ...overrides })) {
    if (value !== undefined) env[key] = value;
  }
  // The harness must never let real provider keys leak into a packaged run:
  // the "provider keys from package" startup.log assertion depends on them
  // coming from packaged-env.json, and dummy keys keep everything offline.
  delete env.CURSEFORGE_API_KEY;
  delete env.STEAM_API_KEY;
  env.GAMEVAULT_TEST_HARNESS = "1";
  return env;
}

/** CI runners (xvfb) can't use the Chromium user-namespace sandbox. */
function sandboxOption(): { chromiumSandbox: boolean } | Record<string, never> {
  return process.env.E2E_GUI_NO_SANDBOX === "1" ? { chromiumSandbox: false } : {};
}

/** Launch the dev electron binary pointed at the harness app server. */
export async function launchDevElectron(appBaseUrl: string): Promise<ElectronApplication> {
  // Isolated userData: a persisted session cookie from a previous run would
  // auto-login against the fresh throwaway DB and skip the login page.
  const fs = await import("fs");
  const { DEV_USER_DATA_DIR } = await import("./config");
  fs.rmSync(DEV_USER_DATA_DIR, { recursive: true, force: true });
  return _electron.launch({
    args: ["."],
    cwd: REPO_ROOT,
    env: harnessEnv({
      GAMEVAULT_DEV: "1",
      GAMEVAULT_DEV_URL: appBaseUrl,
      GAMEVAULT_USER_DATA_DIR: DEV_USER_DATA_DIR,
      ELECTRON_ENABLE_STACK_DUMPING: "1",
    }),
    ...sandboxOption(),
  });
}

/** Launch a packaged (electron-builder --dir) app bundle. */
export async function launchPackagedElectron(
  executablePath: string,
  userDataDir: string,
  extraEnv: Record<string, string>
): Promise<ElectronApplication> {
  return _electron.launch({
    executablePath,
    env: harnessEnv({
      GAMEVAULT_USER_DATA_DIR: userDataDir,
      ...extraEnv,
    }),
    ...sandboxOption(),
  });
}

export async function firstWindow(electronApp: ElectronApplication): Promise<Page> {
  const page = await electronApp.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/** Drive the real login form; resolves once the dashboard renders. */
export async function loginViaUi(page: Page, user = ADMIN_USER): Promise<void> {
  await page.getByPlaceholder("name@domain.com").fill(user.email);
  await page.getByPlaceholder("••••••••").fill(user.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await page.getByRole("heading", { name: "Active Servers" }).waitFor({ timeout: 20_000 });
}

/**
 * Quit through the app's own File → Quit menu item — the same code path as the
 * tray Quit (beginQuit → app.quit → before-quit stopAllServers). app.quit()
 * from the harness would skip beginQuit and bypass the graceful path.
 */
export async function quitViaMenu(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) throw new Error("no application menu — buildTray() never ran");
    const file = menu.items.find((item) => item.label === "File");
    const quit = file?.submenu?.items.find((item) => item.label === "Quit");
    if (!quit) throw new Error("File → Quit menu item not found");
    quit.click();
  });
}

export async function waitForExit(
  electronApp: ElectronApplication,
  timeoutMs: number
): Promise<void> {
  const proc = electronApp.process();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`electron did not exit within ${timeoutMs}ms`)),
      timeoutMs
    );
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Screenshot + console tail on failure, for the report dir. */
export async function captureFailure(ctx: {
  page: Page;
  reportDir: string;
  scenarioId: string;
  err: Error;
}): Promise<void> {
  const fs = await import("fs");
  fs.mkdirSync(ctx.reportDir, { recursive: true });
  const safe = ctx.scenarioId.replace(/[^a-z0-9-]/gi, "_");
  try {
    await ctx.page.screenshot({ path: path.join(ctx.reportDir, `${safe}-failure.png`), fullPage: true });
  } catch {
    /* window may already be gone */
  }
  console.error(`    [e2e-gui] failure screenshot: ${path.join(ctx.reportDir, `${safe}-failure.png`)}`);
}
