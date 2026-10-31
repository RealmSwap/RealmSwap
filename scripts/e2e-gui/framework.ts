/**
 * Scenario framework for the GUI e2e harness (Layer 2 of the zero-human test
 * plan). Same shape and reporting conventions as the API harness
 * (scripts/e2e-api/scenarios) so the route-ledger guard can credit coverage
 * from either harness.
 */

import type { ElectronApplication, Page, Response } from "playwright";
import type { FakeSupabase } from "../e2e-api/fakeSupabase";

export interface GuiContext {
  /** The Electron app launched for this run (dev pass or packaged pass). */
  electronApp: ElectronApplication;
  /** The app's single BrowserWindow page. */
  page: Page;
  fakeSupabase: FakeSupabase;
  /** Where reports/screenshots land. */
  reportDir: string;
}

export interface GuiScenario {
  id: string;
  description: string;
  tags: string[];
  run: (ctx: GuiContext) => Promise<void>;
}

export function scenario(
  id: string,
  description: string,
  tags: string[],
  run: (ctx: GuiContext) => Promise<void>
): GuiScenario {
  return { id, description, tags, run };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Server-card status badge strings, from src/lib/gameDisplay.ts statusLabel. */
export const STATUS_LABELS = {
  RUNNING: "Online",
  STARTING: "Starting…",
  UPDATING: "Updating…",
  CRASHED: "Crashed",
  STOPPED: "Offline",
} as const;

/** Poll the named server card until its text contains one of `want`. */
export async function waitForCardStatus(
  page: Page,
  serverName: string,
  want: string[],
  timeoutMs: number
): Promise<string> {
  const card = page.locator(`[aria-label="Select server ${serverName}"]`);
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = (await card.textContent().catch(() => "")) ?? "";
    for (const w of want) {
      if (last.includes(w)) return w;
    }
    await sleep(1000);
  }
  throw new Error(
    `server card "${serverName}" never showed ${want.join(" | ")} within ${timeoutMs}ms — last card text: ${last.slice(0, 300)}`
  );
}

/**
 * Run `action` and capture the first matching request/response it fires.
 * Promise.all attaches the rejection handler immediately, so a response that
 * never arrives surfaces as a scenario failure instead of an unhandled
 * rejection that crashes the whole harness run.
 */
export async function captureResponseOn(
  page: Page,
  predicate: (url: string, method: string) => boolean,
  action: () => Promise<void>,
  timeoutMs = 30_000
): Promise<Response> {
  const [captured] = await Promise.all([
    page
      .waitForResponse((r) => predicate(r.url(), r.request().method()), { timeout: timeoutMs })
      .catch((err: Error) => err),
    action(),
  ]);
  if (captured instanceof Error) {
    throw new Error(`expected request never fired: ${captured.message}`);
  }
  return captured as Response;
}

/**
 * Dismiss the first-boot celebration overlay ("Your server is live!") if it's
 * up — it appears the moment a server first comes Online and intercepts every
 * click until dismissed.
 */
export async function dismissCelebrationIfPresent(page: Page): Promise<void> {
  try {
    await page.getByRole("button", { name: "Later", exact: true }).click({ timeout: 4000 });
  } catch {
    /* not showing — nothing to dismiss */
  }
}

/** Click a sidebar nav link and wait for the expected heading to render. */
export async function navigateAndExpect(
  page: Page,
  navLabel: string,
  heading: string
): Promise<void> {
  // exact: headings like "Automation" also substring-match "No Automations
  // Found" empty-state headings otherwise.
  await page.getByRole("link", { name: navLabel, exact: true }).click();
  await page
    .getByRole("heading", { name: heading, exact: true })
    .waitFor({ timeout: 20_000 });
}
