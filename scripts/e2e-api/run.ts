/**
 * API e2e harness entry point (Layer 1 of the zero-human test plan).
 *
 *   npm run e2e:api            # @smoke scenarios — every PR
 *   npm run e2e:api:heavy      # + @heavy scenarios (real installs) — nightly
 *
 * Boots the production server on :3100 against a throwaway DB + data dir with
 * a local fake Supabase, then drives real flows in dependency order. Exits
 * non-zero on any failure; a machine-readable report lands in the data dir.
 */

import fs from "fs";
import path from "path";
import { ApiClient } from "./client";
import { ADMIN_USER, APP_BASE_URL, DATA_DIR } from "./config";
import { startApp } from "./app";
import { authScenarios } from "./scenarios/auth";
import { mcLifecycleScenarios } from "./scenarios/mcLifecycle";
import { modsScenarios } from "./scenarios/mods";
import { loaderScenarios } from "./scenarios/loaders";
import { packScenarios } from "./scenarios/packs";
import { surfaceScenarios } from "./scenarios/surface";
import { membershipScenarios } from "./scenarios/membership";
import { backupScenarios } from "./scenarios/backups";
import { realmsyncScenarios } from "./scenarios/realmsync";
import { marketplaceScenarios } from "./scenarios/marketplace";
import { agentScenarios } from "./scenarios/agents";
import { opsScenarios } from "./scenarios/ops";
import { botScenarios } from "./scenarios/bots";
import type { Scenario, ScenarioContext } from "./scenarios/framework";

const ALL_SCENARIOS: Scenario[] = [
  ...authScenarios,
  ...mcLifecycleScenarios,
  ...modsScenarios,
  ...loaderScenarios,
  ...packScenarios,
  ...surfaceScenarios,
  ...membershipScenarios,
  ...backupScenarios,
  ...realmsyncScenarios,
  ...marketplaceScenarios,
  ...agentScenarios,
  ...opsScenarios,
  ...botScenarios,
];

function parseTag(): string {
  const idx = process.argv.indexOf("--tag");
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  return value || "smoke";
}

async function main(): Promise<number> {
  const tag = parseTag();
  const selected =
    tag === "all" ? ALL_SCENARIOS : ALL_SCENARIOS.filter((s) => s.tags.includes(tag));

  if (!selected.length) {
    console.error(`[e2e-api] no scenarios tagged @${tag}`);
    return 2;
  }

  console.log(`[e2e-api] API e2e — app ${APP_BASE_URL}, data ${DATA_DIR}, tag @${tag}`);
  console.log(`[e2e-api] ${selected.length} scenario(s): ${selected.map((s) => s.id).join(", ")}`);

  // The admin account pre-exists in the fake; the member account is created by
  // the auth scenario through the real /api/auth/register route.
  const results: { id: string; description: string; status: "pass" | "fail"; error?: string; ms: number }[] = [];
  const app = await startApp();
  app.fakeSupabase.addUser({ ...ADMIN_USER, id: "e2ea0000-0000-4000-8000-0000000000a1" });

  const ctx: ScenarioContext = {
    admin: new ApiClient(APP_BASE_URL),
    handle: app,
    fakeSupabase: app.fakeSupabase,
    state: {},
  };

  try {
    for (const scenarioDef of selected) {
      console.log(`\n  ▸ ${scenarioDef.id} — ${scenarioDef.description}`);
      const t0 = Date.now();
      try {
        await scenarioDef.run(ctx);
        results.push({ id: scenarioDef.id, description: scenarioDef.description, status: "pass", ms: Date.now() - t0 });
        console.log(`  ✔ ${scenarioDef.id} passed`);
      } catch (err: any) {
        results.push({
          id: scenarioDef.id,
          description: scenarioDef.description,
          status: "fail",
          error: err.message,
          ms: Date.now() - t0,
        });
        console.error(`  ✘ ${scenarioDef.id} FAILED`);
      }
    }
  } finally {
    console.log("\n[e2e-api] tearing down…");
    try {
      await app.stop();
    } catch (err: any) {
      console.error(`[e2e-api] teardown warning: ${err.message}`);
    }
  }

  const report = {
    runAt: new Date().toISOString(),
    tag,
    appBaseUrl: APP_BASE_URL,
    results,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
  };
  const reportPath = path.join(DATA_DIR, "e2e-api-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n[e2e-api] results — ${report.passed} passed, ${report.failed} failed (report: ${reportPath})`);
  for (const r of results) {
    console.log(`  ${r.status === "pass" ? "✓" : "✗"} ${r.id} (${Math.round(r.ms / 1000)}s)${r.error ? `\n      ${r.error}` : ""}`);
  }

  if (report.failed > 0) {
    console.error(`\n[e2e-api] app output tail on failure:\n${app.outputTail()}`);
    return 1;
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[e2e-api] fatal: ${err.message}`);
    process.exit(1);
  });
