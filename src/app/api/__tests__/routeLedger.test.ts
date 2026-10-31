/**
 * Route-ledger drift guard (zero-human test plan, Layer 1 item 12).
 *
 * The API e2e harness (scripts/e2e-api) covers routes through real flows; the
 * ledger (scripts/e2e-api/routes-ledger.json) maps every API route on disk to
 * its coverage status. This test fails CI when the two drift apart:
 *
 * 1. a route file or HTTP method ships without a ledger entry — the harness
 *    map must grow with the API, or "every functionality is covered" rots;
 * 2. a ledger entry points at a route/method that no longer exists;
 * 3. a `covered` entry references a scenario id that no scenario defines —
 *    entries can't claim coverage the harness doesn't exercise;
 * 4. statuses fall outside the known enum.
 */

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const API_DIR = path.join(REPO_ROOT, "src", "app", "api");
const LEDGER_PATH = path.join(REPO_ROOT, "scripts", "e2e-api", "routes-ledger.json");
const SCENARIOS_DIRS = [
  path.join(REPO_ROOT, "scripts", "e2e-api", "scenarios"),
  // The GUI harness (scripts/e2e-gui) owns routes whose coverage IS the UI —
  // e.g. POST /api/system/open-folder, driven through the dashboard Files
  // button. Covered entries may reference scenario ids from either harness.
  path.join(REPO_ROOT, "scripts", "e2e-gui", "scenarios"),
];
const KNOWN_STATUSES = ["covered", "planned", "manual"];

interface LedgerEntry {
  status: string;
  scenarios?: string[];
  note?: string;
}

function routesOnDisk(): Map<string, string> {
  const found = new Map<string, string>(); // "METHOD /api/..." -> file for error messages
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== "route.ts") continue;
      const routePath = full.slice(API_DIR.length, -"route.ts".length).replace(/\/$/, "") || "";
      const src = fs.readFileSync(full, "utf8");
      for (const match of Array.from(src.matchAll(/export async function (GET|POST|PUT|DELETE|PATCH)/g))) {
        found.set(`${match[1]} /api${routePath}`, path.relative(REPO_ROOT, full));
      }
    }
  };
  walk(API_DIR);
  return found;
}

function scenarioIds(): Set<string> {
  const ids = new Set<string>();
  for (const dir of SCENARIOS_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".ts")) continue;
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      for (const match of Array.from(src.matchAll(/\bscenario\(\s*"([^"]+)"/g))) ids.add(match[1]);
    }
  }
  return ids;
}

describe("route ledger ↔ API surface parity", () => {
  it("ledger keys match the routes on disk exactly (both directions)", () => {
    const disk = routesOnDisk();
    const ledger: Record<string, LedgerEntry> = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
    const ledgerKeys = new Set(Object.keys(ledger));

    const missingFromLedger = Array.from(disk.keys()).filter((k) => !ledgerKeys.has(k));
    const staleInLedger = Array.from(ledgerKeys).filter((k) => !disk.has(k));

    expect(
      missingFromLedger,
      `route(s) shipped without a harness ledger entry — add them to ${path.relative(REPO_ROOT, LEDGER_PATH)} ` +
        `(status "covered" + scenario ids when the e2e-api harness exercises them, "planned" with a note otherwise): ` +
        missingFromLedger.map((k) => `${k} (${disk.get(k)})`).join(", ")
    ).toEqual([]);
    expect(
      staleInLedger,
      `ledger entries point at routes that no longer exist: ${staleInLedger.join(", ")}`
    ).toEqual([]);
  });

  it("statuses are known and covered entries reference real scenarios", () => {
    const ledger: Record<string, LedgerEntry> = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
    const knownScenarios = scenarioIds();
    expect(knownScenarios.size > 0, "no scenario ids found under scripts/e2e-api/scenarios — harness missing?").toBe(true);

    const problems: string[] = [];
    for (const [route, entry] of Object.entries(ledger)) {
      if (!KNOWN_STATUSES.includes(entry.status)) {
        problems.push(`${route}: unknown status "${entry.status}" (want ${KNOWN_STATUSES.join("|")})`);
      }
      if (entry.status === "covered") {
        if (!entry.scenarios?.length) {
          problems.push(`${route}: status "covered" but no scenarios listed`);
          continue;
        }
        for (const id of entry.scenarios) {
          if (!knownScenarios.has(id)) {
            problems.push(`${route}: claims scenario "${id}" which no scenario defines`);
          }
        }
      }
      if (entry.status === "planned" && !entry.note) {
        problems.push(`${route}: status "planned" should carry a note (target PR / reason)`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("the harnesses have not regressed below the full-coverage baseline", () => {
    const ledger: Record<string, LedgerEntry> = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
    const covered = Object.values(ledger).filter((e) => e.status === "covered").length;
    // Since PR-D every route-method is covered by the API or GUI harness; the
    // floor keeps a silent shrink impossible. New routes raise the count or
    // ship as "planned" with a note (which lowers this floor's meaning — keep
    // the floor at the last all-covered count).
    expect(covered).toBeGreaterThanOrEqual(135);
  });
});
