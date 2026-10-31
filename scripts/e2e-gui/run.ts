/**
 * GUI e2e harness entry point (Layer 2 of the zero-human test plan).
 *
 *   npm run e2e:gui            # dev-mode pass — @smoke scenarios
 *   npm run e2e:gui:heavy      # + @heavy (live Modrinth install through the UI)
 *   npm run e2e:gui:packaged   # packaged mac boot pass (electron-builder --dir)
 *
 * The dev pass reuses the API harness's boot chain (throwaway DB, fake
 * Supabase, next start on :3100) and drives the real Electron window against
 * it via GAMEVAULT_DEV_URL. The developer's :3000 dev server is untouched.
 */

import fs from "fs";
import path from "path";
import { ADMIN_USER, APP_BASE_URL, DATA_DIR } from "../e2e-api/config";
import { startApp } from "../e2e-api/app";
import { launchDevElectron, firstWindow, captureFailure, quitViaMenu } from "./electron";
import { sleep } from "./framework";
import type { GuiContext, GuiScenario } from "./framework";
import { authAndShellScenarios } from "./scenarios/authNav";
import { serverLifecycleScenarios } from "./scenarios/serverFlow";
import { settingsIpcScenarios } from "./scenarios/settingsIpc";
import { modsInstallScenarios } from "./scenarios/modsInstall";
import { teardownQuitScenarios } from "./scenarios/quitToTray";
import { runPackagedPass } from "./scenarios/packagedBoot";

const DEV_SCENARIOS: GuiScenario[] = [
  ...authAndShellScenarios,
  ...serverLifecycleScenarios,
  ...settingsIpcScenarios,
  ...modsInstallScenarios,
  ...teardownQuitScenarios,
];

function parseArgs(): { tag: string; packaged: boolean } {
  const tagIdx = process.argv.indexOf("--tag");
  return {
    tag: tagIdx >= 0 ? process.argv[tagIdx + 1] || "smoke" : "smoke",
    packaged: process.argv.includes("--packaged"),
  };
}

async function runDevPass(tag: string): Promise<number> {
  const selected =
    tag === "all" ? DEV_SCENARIOS : DEV_SCENARIOS.filter((s) => s.tags.includes(tag));
  if (!selected.length) {
    console.error(`[e2e-gui] no scenarios tagged @${tag}`);
    return 2;
  }

  console.log(`[e2e-gui] dev pass — app ${APP_BASE_URL}, tag @${tag}`);
  console.log(`[e2e-gui] ${selected.length} scenario(s): ${selected.map((s) => s.id).join(", ")}`);

  const results: { id: string; description: string; status: "pass" | "fail"; error?: string; ms: number }[] = [];
  const app = await startApp();
  app.fakeSupabase.addUser({ ...ADMIN_USER, id: "e2ea0000-0000-4000-8000-0000000000a1" });

  let electronApp: Awaited<ReturnType<typeof launchDevElectron>> | null = null;
  try {
    electronApp = await launchDevElectron(APP_BASE_URL);
    const page = await firstWindow(electronApp);
    const ctx: GuiContext = {
      electronApp,
      page,
      fakeSupabase: app.fakeSupabase,
      reportDir: DATA_DIR,
    };

    for (const scenarioDef of selected) {
      console.log(`\n  ▸ ${scenarioDef.id} — ${scenarioDef.description}`);
      const t0 = Date.now();
      try {
        await scenarioDef.run(ctx);
        results.push({ id: scenarioDef.id, description: scenarioDef.description, status: "pass", ms: Date.now() - t0 });
        console.log(`  ✔ ${scenarioDef.id} passed`);
      } catch (err: any) {
        results.push({ id: scenarioDef.id, description: scenarioDef.description, status: "fail", error: err.message, ms: Date.now() - t0 });
        console.error(`  ✘ ${scenarioDef.id} FAILED: ${err.message}`);
        await captureFailure({ page, reportDir: DATA_DIR, scenarioId: scenarioDef.id, err });
      }
    }
  } finally {
    console.log("\n[e2e-gui] tearing down…");
    if (electronApp) {
      try {
        await quitViaMenu(electronApp);
        await sleep(3000);
      } catch { /* already gone */ }
      try {
        await electronApp.close();
      } catch { /* ignore */ }
    }
    try {
      await app.stop();
    } catch (err: any) {
      console.error(`[e2e-gui] teardown warning: ${err.message}`);
    }
  }

  const report = {
    runAt: new Date().toISOString(),
    pass: "dev",
    tag,
    appBaseUrl: APP_BASE_URL,
    results,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
  };
  const reportPath = path.join(DATA_DIR, "e2e-gui-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n[e2e-gui] results — ${report.passed} passed, ${report.failed} failed (report: ${reportPath})`);
  for (const r of results) {
    console.log(`  ${r.status === "pass" ? "✓" : "✗"} ${r.id} (${Math.round(r.ms / 1000)}s)${r.error ? `\n      ${r.error}` : ""}`);
  }
  return report.failed > 0 ? 1 : 0;
}

async function main(): Promise<number> {
  const { tag, packaged } = parseArgs();
  if (packaged) return runPackagedPass();
  return runDevPass(tag);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[e2e-gui] fatal: ${err.message}`);
    process.exit(1);
  });
