/**
 * Scenario framework. A scenario is an ordered chain of steps against the
 * running app; the first failed step fails the scenario (later steps depend on
 * earlier state). Scenario ids are referenced by scripts/e2e-api/routes-ledger
 * .json and cross-checked by the route-ledger guard test in src/app/api/
 * __tests__/routeLedger.test.ts — keep the `scenario("id"` call shape intact.
 */

import { ApiClient } from "../client";
import type { AppHandle } from "../app";
import type { FakeSupabase } from "../fakeSupabase";

export interface ScenarioContext {
  admin: ApiClient;
  handle: AppHandle;
  fakeSupabase: FakeSupabase;
  /** Cross-scenario state (e.g. definitionId found by the auth scenario). */
  state: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  description: string;
  tags: string[];
  run: (ctx: ScenarioContext) => Promise<void>;
}

export function scenario(
  id: string,
  description: string,
  tags: string[],
  run: (ctx: ScenarioContext) => Promise<void>
): Scenario {
  return { id, description, tags, run };
}

/** Named step with pass/fail logging; throws on failure (fail-fast). */
export async function step(name: string, fn: () => Promise<void>): Promise<void> {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`    ✓ ${name} (${Date.now() - t0}ms)`);
  } catch (err: any) {
    console.error(`    ✗ ${name} (${Date.now() - t0}ms): ${err.message}`);
    throw err;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until fn returns a truthy value or the deadline passes; returns the last value. */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  isDone: (value: T) => boolean,
  timeoutMs: number,
  intervalMs = 3000,
  onTick?: (value: T) => void
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await fn();
  while (!isDone(value) && Date.now() < deadline) {
    onTick?.(value);
    await sleep(intervalMs);
    value = await fn();
  }
  return value;
}
