/**
 * Packaged mac boot pass (Layer 2, packaged half) — builds the real mac app
 * bundle with electron-builder --dir against the fake-Supabase build env, then
 * boots it exactly like an installed copy (its own throwaway userData):
 *
 *   1. startup.log shows: packaged launch line, `provider keys from package`
 *      (both names, from packaged-env.json), `migrations applied: [...]`, and
 *      `server ready on port N` — and no STARTUP ERROR.
 *   2. The in-process standalone server answers /start on the logged port.
 *   3. The window logs in through the real form; the Dedicated Box
 *      launch-on-boot toggle round-trips through IPC with supported:true.
 *   4. File → Quit exits the process cleanly (before-quit → stopAllServers).
 *
 * On Windows this whole pass belongs to the CI smoke workflow (PR-E, plan
 * layer 3); here it is mac-only on purpose.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import {
  PACKAGED_BOOT_TIMEOUT_MS,
  PACKAGED_EXECUTABLE,
  PACKAGED_USER_DATA_DIR,
  QUIT_TIMEOUT_MS,
} from "../config";
import {
  firstWindow,
  launchPackagedElectron,
  loginViaUi,
  quitViaMenu,
  waitForExit,
} from "../electron";
import { sleep } from "../framework";
import { FakeSupabase } from "../../e2e-api/fakeSupabase";
import {
  ADMIN_USER,
  FAKE_SUPABASE_ANON_KEY,
  FAKE_SUPABASE_URL,
  REPO_ROOT,
  SUPABASE_JWT_SECRET,
} from "../../e2e-api/config";

const PACKAGED_ENV_PATH = path.join(REPO_ROOT, "packaged-env.json");
const DUMMY_PROVIDER_KEYS = {
  CURSEFORGE_API_KEY: "e2e-gui-dummy-curseforge-key",
  STEAM_API_KEY: "e2e-gui-dummy-steam-key",
};

function log(msg: string) {
  console.log(`[e2e-gui:packaged] ${msg}`);
}

function npx(args: string[], env: Record<string, string>): void {
  const bin = process.platform === "win32" ? "npx.cmd" : "npx";
  const res = spawnSync(bin, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (res.status !== 0) throw new Error(`${args.join(" ")} exited ${res.status}`);
}

async function portInUse(port: number): Promise<boolean> {
  // Binding success means the port was free; EADDRINUSE means it's taken.
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(true));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(false)));
  });
}

async function buildMacApp(): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("the packaged pass is mac-only here; Windows coverage lives in the CI smoke workflow (plan layer 3)");
  }
  if (!process.env.E2E_GUI_SKIP_BUILD) {
    if (process.env.E2E_GUI_KILL_DEV === "1") {
      log("E2E_GUI_KILL_DEV=1 — killing the :3000 dev-server tree…");
      spawnSync("sh", ["-c", "kill $(lsof -ti :3000 -sTCP:LISTEN) 2>/dev/null; pkill -f 'next-server' 2>/dev/null; true"]);
      // next's graceful shutdown can take several seconds — poll, don't guess.
      const freeDeadline = Date.now() + 20_000;
      while ((await portInUse(3000)) && Date.now() < freeDeadline) await sleep(1000);
    }
    if (await portInUse(3000)) {
      throw new Error(
        ":3000 is busy — `next build` for the packaged app writes the shared .next dir. " +
          "Kill the dev-server tree first (kill $(lsof -ti :3000 -sTCP:LISTEN)), or set E2E_GUI_KILL_DEV=1 to let the harness do it, " +
          "or E2E_GUI_SKIP_BUILD=1 to reuse the existing dist/ bundle."
      );
    }
    log("template DB (pre-release gate)…");
    npx(["node", "scripts/make-template-db.js"], {});
    log("next build (standalone, fake Supabase baked)…");
    npx(["npx", "next", "build"], {
      DATABASE_URL: "file:./prisma/packaged-build.db",
      NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:0",
      NEXT_TELEMETRY_DISABLED: "1",
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
      BILLING_ENABLED: "0",
    });
    log("electron-builder --dir (mac, unsigned)…");
    npx(["npx", "electron-builder", "--dir", "--publish", "never"], {
      DATABASE_URL: "file:./prisma/packaged-build.db",
      NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_SUPABASE_ANON_KEY,
      NEXT_TELEMETRY_DISABLED: "1",
    });
  }
  if (!fs.existsSync(PACKAGED_EXECUTABLE)) {
    throw new Error(`packaged app not found at ${PACKAGED_EXECUTABLE} — build first`);
  }
}

async function readStartupLog(): Promise<string> {
  const logPath = path.join(PACKAGED_USER_DATA_DIR, "startup.log");
  try {
    return await fs.promises.readFile(logPath, "utf8");
  } catch {
    return "";
  }
}

interface StepResult {
  id: string;
  status: "pass" | "fail";
  error?: string;
}

export async function runPackagedPass(): Promise<number> {
  const results: StepResult[] = [];
  const step = async (id: string, fn: () => Promise<void>) => {
    console.log(`  ▸ ${id}`);
    const t0 = Date.now();
    try {
      await fn();
      results.push({ id, status: "pass" });
      console.log(`  ✔ ${id} (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (err: any) {
      // Evidence for the report: URL + body text + screenshot + app console.
      let evidence = "";
      try {
        const page = await electronApp!.firstWindow();
        evidence = `\n    url: ${page.url()}\n    body: ${(await page.locator("body").textContent())?.replace(/\s+/g, " ").slice(0, 300)}`;
        await page.screenshot({ path: `/tmp/realmswap-e2e-gui-${id.replace(/[^a-z0-9-]/gi, "_")}-failure.png` });
      } catch { /* window gone */ }
      results.push({ id, status: "fail", error: err.message });
      console.error(`  ✘ ${id} FAILED: ${err.message}${evidence}`);
      throw err;
    }
  };

  // The committed placeholder is `{}`; shipping both (dummy) provider keys in
  // the package is what makes the `provider keys from package` startup.log
  // line assertable. Always restored in finally.
  const originalPackagedEnv = fs.existsSync(PACKAGED_ENV_PATH)
    ? fs.readFileSync(PACKAGED_ENV_PATH, "utf8")
    : null;
  fs.writeFileSync(PACKAGED_ENV_PATH, JSON.stringify(DUMMY_PROVIDER_KEYS, null, 2));

  const fakeSupabase = new FakeSupabase();
  let electronApp: Awaited<ReturnType<typeof launchPackagedElectron>> | null = null;

  try {
    await buildMacApp();

    await fakeSupabase.start();
    fakeSupabase.addUser({ ...ADMIN_USER, id: "e2ea0000-0000-4000-8000-0000000000a1" });
    log(`fake Supabase on ${FAKE_SUPABASE_URL}`);

    fs.rmSync(PACKAGED_USER_DATA_DIR, { recursive: true, force: true });
    fs.mkdirSync(PACKAGED_USER_DATA_DIR, { recursive: true });

    electronApp = await launchPackagedElectron(PACKAGED_EXECUTABLE, PACKAGED_USER_DATA_DIR, {
      SUPABASE_JWT_SECRET,
      BILLING_ENABLED: "0",
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
      NEXT_TELEMETRY_DISABLED: "1",
    });
    const page = await firstWindow(electronApp);

    // 1. startup.log markers + the standalone server answers on its port.
    await step("packaged/boot-and-startup-log", async () => {
      const deadline = Date.now() + PACKAGED_BOOT_TIMEOUT_MS;
      let tail = "";
      while (Date.now() < deadline) {
        tail = await readStartupLog();
        if (tail.includes("server ready on port")) break;
        if (tail.includes("STARTUP ERROR")) {
          throw new Error(`packaged boot failed:\n${tail.slice(-1500)}`);
        }
        await sleep(500);
      }
      if (!tail.includes("startup: packaged launch, dataDir=")) {
        throw new Error(`startup.log missing packaged launch line:\n${tail}`);
      }
      if (!tail.includes("provider keys from package: CURSEFORGE_API_KEY, STEAM_API_KEY")) {
        throw new Error(`startup.log missing provider keys line:\n${tail.slice(-800)}`);
      }
      if (!/migrations applied: \[/.test(tail)) {
        throw new Error(`startup.log missing migrations line:\n${tail.slice(-800)}`);
      }
      if (tail.includes("STARTUP ERROR")) {
        throw new Error(`startup.log contains STARTUP ERROR:\n${tail.slice(-1500)}`);
      }
      const portMatch = tail.match(/server ready on port (\d+)/);
      if (!portMatch) throw new Error(`no "server ready on port" marker in startup.log`);
      const port = Number(portMatch[1]);
      const res = await fetch(`http://127.0.0.1:${port}/start`, { signal: AbortSignal.timeout(10_000) });
      if (res.status !== 200) throw new Error(`/start answered ${res.status}`);
      log(`standalone server answering on :${port}`);
    });

    // 2. Real login through the window.
    await step("packaged/ui-login-dashboard", async () => {
      await page.getByRole("heading", { name: "Welcome Back" }).waitFor({ timeout: 30_000 });
      await loginViaUi(page);
    });

    // 3. launch-on-boot IPC round-trip with supported:true (toggles the real
    // OS login item, then restores it to off; finally{} also guards).
    await step("packaged/launch-on-boot-toggle", async () => {
      await page.locator('[aria-label="Account settings"]').click();
      await page.getByRole("heading", { name: "Dedicated Box" }).waitFor({ timeout: 20_000 });
      await page
        .getByText("RealmSwap launches automatically at sign-in and keeps running in the tray when the window is closed.")
        .waitFor({ timeout: 10_000 });

      // The innermost row that contains both the Dedicated Box heading and a
      // checkbox (the settings page has 5 other toggles).
      const row = page
        .locator("div")
        .filter({ has: page.getByRole("heading", { name: "Start RealmSwap when this PC signs in", exact: true }) })
        .filter({ has: page.locator('input[type="checkbox"]') })
        .last();
      const toggle = row.locator('input[type="checkbox"]');
      await toggle.waitFor({ timeout: 10_000 });
      // The styled switch is a label wrapping an sr-only checkbox — click the
      // label, like a human (force-clicking the hidden input does nothing).
      const switchLabel = row.locator("label");
      await switchLabel.click();
      await sleep(1000);
      const uiChecked = await toggle.isChecked().catch(() => null);
      const settings = await electronApp!.evaluate(({ app }) => app.getLoginItemSettings());
      if (settings.openAtLogin !== true || uiChecked !== true) {
        throw new Error(
          `toggle on did not register the login item (uiChecked=${uiChecked}, loginSettings=${JSON.stringify(settings)})`
        );
      }

      await switchLabel.click();
      await sleep(1000);
      const settingsAfterOff = await electronApp!.evaluate(({ app }) => app.getLoginItemSettings());
      if (settingsAfterOff.openAtLogin !== false) {
        throw new Error(`toggle off left the login item registered (loginSettings=${JSON.stringify(settingsAfterOff)})`);
      }
    });

    // 4. Graceful quit through the real menu path (beginQuit → before-quit →
    // stopAllServers → exit).
    await step("packaged/graceful-quit", async () => {
      await quitViaMenu(electronApp!);
      await waitForExit(electronApp!, QUIT_TIMEOUT_MS);
      const tail = await readStartupLog();
      if (tail.includes("STARTUP ERROR")) {
        throw new Error(`startup.log grew a STARTUP ERROR during the session:\n${tail.slice(-1500)}`);
      }
    });

    return 0;
  } catch (err: any) {
    console.error(`[e2e-gui:packaged] fatal: ${err.message}`);
    return 1;
  } finally {
    if (electronApp) {
      try {
        // Never leave a login item pointing at the throwaway build.
        await electronApp.evaluate(({ app }) => app.setLoginItemSettings({ openAtLogin: false }));
      } catch { /* app may be gone */ }
      try {
        await electronApp.evaluate(({ app }) => app.quit());
      } catch { /* already gone */ }
      await sleep(1500);
    }
    fs.writeFileSync(PACKAGED_ENV_PATH, originalPackagedEnv ?? "{}\n");
    try {
      await fakeSupabase.stop();
    } catch { /* ignore */ }
    const failed = results.filter((r) => r.status === "fail");
    console.log(`\n[e2e-gui:packaged] ${results.length - failed.length}/${results.length} steps passed`);
    for (const r of results) {
      console.log(`  ${r.status === "pass" ? "✓" : "✗"} ${r.id}${r.error ? ` — ${r.error}` : ""}`);
    }
  }
}
