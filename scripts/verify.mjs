#!/usr/bin/env node
/**
 * One-command full verification (the "G" step of the zero-human test plan):
 *
 *   npm run verify            # every-PR tier — ~15 min on a dev Mac
 *   npm run verify:heavy      # + the @heavy e2e scenarios — ~30 min
 *
 * Stages (all run regardless of earlier failures — the summary table at the
 * end decides the exit code):
 *
 *   typecheck    npx tsc --noEmit (a stale untracked dist/ bundle is parked
 *               for the duration — it tangles tsc into fake errors)
 *   unit         npx vitest run
 *   template-db  scripts/make-template-db.js must print "Template DB created"
 *               (drives every real migration through the packaged runner)
 *   api-e2e      scripts/e2e-api harness, @smoke (or all with --heavy)
 *   gui-e2e      scripts/e2e-gui dev pass, @smoke (or all with --heavy)
 *   playwright   npx playwright test --grep @public — only when no dev
 *               server holds the project's Next lock (:3000); skipped
 *               honestly otherwise (stop the dev server to include it)
 *
 * Never starts, stops, or restarts the :3000 dev server — it only reads port
 * state and skips with instructions. A machine-readable report lands in
 * /tmp/realmswap-verify/verify-report.json.
 */

import net from "net";
import fs from "fs";
import path from "path";
import { spawnSync, execSync } from "child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPORT_DIR = "/tmp/realmswap-verify";
const heavy = process.argv.includes("--heavy");

function portInUse(port) {
  // Bind-probe the port. The close-callback path is guarded by a timeout —
  // server.close() has been observed to never fire its callback here, which
  // would wedge the whole script while still holding the port.
  return new Promise((resolve) => {
    const server = net.createServer();
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      try { server.close(); } catch {}
      resolve(value);
    };
    server.once("error", () => finish(true));
    server.once("listening", () => {
      server.close(() => finish(false));
      setTimeout(() => finish(false), 1500);
    });
    server.listen(port, "127.0.0.1");
  });
}

async function main() {
  const stages = [];
  const t0 = Date.now();
  console.log(`[verify] RealmSwap full verification${heavy ? " (--heavy)" : ""}`);
  console.log(`[verify] stages: typecheck → unit → template-db → api-e2e → gui-e2e → playwright\n`);

  // --- typecheck -----------------------------------------------------------
  // A leftover untracked dist/ bundle (packaged-boot artifacts) drags tsc
  // through vendored minified code and produces dozens of fake errors. Park
  // it OUTSIDE the project for the typecheck only — tsconfig excludes the
  // dist path itself, so any in-tree parking spot would still be crawled.
  const dist = path.join(ROOT, "dist");
  const parkDir = `/tmp/rs-verify-parked-dist-${process.pid}`;
  let parked = false;
  if (fs.existsSync(dist) && fs.readdirSync(dist).length > 0) {
    try {
      fs.renameSync(dist, parkDir);
    } catch (err) {
      if (err.code !== "EXDEV") throw err;
      fs.cpSync(dist, parkDir, { recursive: true });
      fs.rmSync(dist, { recursive: true, force: true });
    }
    parked = true;
    console.log("[verify] parked untracked dist/ in /tmp for a clean typecheck (restored after)");
  }
  try {
    await runStage(stages, "typecheck", "npx", ["tsc", "--noEmit"]);
  } finally {
    if (parked) {
      fs.rmSync(dist, { recursive: true, force: true });
      try {
        fs.renameSync(parkDir, dist);
      } catch (err) {
        if (err.code !== "EXDEV") throw err;
        fs.cpSync(parkDir, dist, { recursive: true });
        fs.rmSync(parkDir, { recursive: true, force: true });
      }
    }
  }

  // --- unit ----------------------------------------------------------------
  await runStage(stages, "unit", "npx", ["vitest", "run"]);

  // --- template-db ---------------------------------------------------------
  await runStage(stages, "template-db", "node", ["scripts/make-template-db.js"], {
    capture: true,
    checkOutput: (out) => out.includes("Template DB created"),
    outputHint: 'output must contain "Template DB created"',
  });

  // --- api-e2e -------------------------------------------------------------
  await runStage(stages, "api-e2e", "npm", ["run", heavy ? "e2e:api:heavy" : "e2e:api"]);

  // --- gui-e2e -------------------------------------------------------------
  await runStage(stages, "gui-e2e", "npm", ["run", heavy ? "e2e:gui:heavy" : "e2e:gui"]);

  // --- playwright ----------------------------------------------------------
  const devPortBusy = await portInUse(3000);
  const e2ePortBusy = await portInUse(3100);
  if (e2ePortBusy) {
    stages.push({
      id: "playwright", status: "FAIL", ms: 0,
      note: "something is listening on :3100 — playwright's webServer would silently reuse it; kill it first (lsof -ti :3100)",
    });
  } else if (devPortBusy) {
    stages.push({
      id: "playwright", status: "SKIP", ms: 0,
      note: "dev server on :3000 holds the Next project lock — stop it (kill the whole tree) and re-run to include this stage",
    });
  } else {
    await runStage(stages, "playwright", "npx", ["playwright", "test", "--grep", "@public"]);
  }

  // --- summary -------------------------------------------------------------
  const failed = stages.filter((s) => s.status === "FAIL");
  console.log("\n[verify] results");
  for (const s of stages) {
    const mark = s.status === "PASS" ? "✓" : s.status === "SKIP" ? "○" : "✗";
    console.log(`  ${mark} ${s.id.padEnd(12)} ${s.status.padEnd(5)} ${(s.ms / 1000).toFixed(1)}s${s.note ? ` — ${s.note}` : ""}`);
  }
  const total = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(
    `[verify] ${stages.length - failed.length}/${stages.length} stages passed, ${total}s total` +
      (failed.length ? ` — FAILED: ${failed.map((s) => s.id).join(", ")}` : " — ALL GREEN")
  );

  let sha = null;
  try { sha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch {}
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(REPORT_DIR, "verify-report.json"),
      JSON.stringify({ when: new Date().toISOString(), sha, heavy, totalSeconds: Number(total), stages }, null, 2)
    );
    console.log(`[verify] report: ${path.join(REPORT_DIR, "verify-report.json")}`);
  } catch {}

  return failed.length ? 1 : 0;
}

function runStage(stages, id, cmd, args, opts = {}) {
  return new Promise((resolve) => {
    console.log(`\n[verify] ▶ ${id}: ${cmd} ${args.join(" ")}`);
    const t0 = Date.now();
    // Streams by default (long stages stay live); template-db captures so its
    // success marker is assertable.
    const res = opts.capture
      ? spawnSync(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
      : spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
    const ms = Date.now() - t0;
    if (opts.capture && res.stdout) process.stdout.write(res.stdout);
    if (opts.capture && res.stderr) process.stderr.write(res.stderr);
    const captured = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    const ok = res.status === 0 && (!opts.checkOutput || opts.checkOutput(captured));
    stages.push({
      id,
      status: ok ? "PASS" : "FAIL",
      ms,
      ...(ok ? {} : { note: res.status !== 0 ? `exit ${res.status}${res.signal ? ` (${res.signal})` : ""}` : opts.outputHint ?? "" }),
    });
    console.log(`[verify] ${ok ? "✓" : "✗"} ${id} (${(ms / 1000).toFixed(1)}s)`);
    resolve();
  });
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`[verify] crashed: ${err?.stack ?? err}`);
    process.exit(1);
  }
);
