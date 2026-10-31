/**
 * gui/server-lifecycle — the full first-run flow through the real UI:
 * first-server wizard → Minecraft server → boot to Online (real MC server,
 * real bundled-JRE provisioning) → live SSE console + a real console command
 * → Join Info modal → the open-folder route through the card's Files button
 * (the last route-method the API harness deliberately left to this layer) →
 * clean stop back to Offline.
 */

import { MC_BOOT_TIMEOUT_MS } from "../config";
import { STATUS_LABELS, dismissCelebrationIfPresent, scenario, waitForCardStatus } from "../framework";

const SERVER_NAME = process.env.E2E_GUI_SERVER_NAME || "GUI Smoke Server";

export const serverLifecycleScenarios = [
  scenario("gui/server-lifecycle", "first-server wizard, real MC boot, console SSE, join info, open-folder, stop", ["smoke"], async (ctx) => {
    const { page } = ctx;

    // --- First-server wizard: pick game → name → deploy ---
    // The game card's accessible name includes its description + RAM text,
    // so match by substring.
    await page.getByRole("button", { name: "Minecraft" }).click();
    const nameInput = page.locator("div:has(> label:has-text('Server name')) > input");
    await nameInput.waitFor({ timeout: 10_000 });
    await nameInput.fill(SERVER_NAME);
    await page.getByRole("button", { name: "Deploy Server" }).click();
    await page
      .getByRole("heading", { name: `${SERVER_NAME} is ready` })
      .waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: "Finish" }).click();

    // The card exists and reports Offline before the first boot.
    const card = page.locator(`[aria-label="Select server ${SERVER_NAME}"]`);
    await card.waitFor({ timeout: 20_000 });
    await waitForCardStatus(page, SERVER_NAME, [STATUS_LABELS.STOPPED], 20_000);

    // --- Start: real boot. The badge goes Starting… then Online. ---
    await card.getByRole("button", { name: "Start", exact: true }).click();
    const reached = await waitForCardStatus(
      page,
      SERVER_NAME,
      [STATUS_LABELS.RUNNING, STATUS_LABELS.CRASHED],
      MC_BOOT_TIMEOUT_MS
    );
    if (reached === STATUS_LABELS.CRASHED) {
      throw new Error("Minecraft server crashed during GUI-driven boot (see server logs)");
    }

    // The first Online flips the "Your server is live!" celebration overlay;
    // it intercepts every click until dismissed.
    await dismissCelebrationIfPresent(page);

    // --- Console: live SSE stream shows real log lines; a command round-trips. ---
    await card.locator('a[title="Console"]').click();
    await page.getByRole("heading", { name: "Live Server Console" }).waitFor({ timeout: 20_000 });
    await page.getByText("LIVE", { exact: true }).waitFor({ timeout: 30_000 });
    // Vanilla's ready marker is the honest "the server actually booted" signal.
    await page.getByText(/Done \(.+s\)! For help/).waitFor({ timeout: 60_000 });

    // The command input is enabled once the stream is live. (Known cosmetic
    // wart: its placeholder can still say "Server must be running…" because
    // the shared server list's status is stale right after navigating here.)
    const commandInput = page.locator("form:has(button:has-text('Send')) input[type='text']");
    const before = await page.locator("div.font-mono > div").count();
    // Capture the POST itself: a non-2xx here means the route refused (server
    // state), silence means the click never fired it — the line-count wait
    // below can't tell those apart.
    const cmdResponse = page.waitForResponse(
      (res) => res.url().includes("/console") && res.request().method() === "POST",
      { timeout: 20_000 }
    );
    await commandInput.fill("list");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const cmdRes = await cmdResponse;
    if (!cmdRes.ok()) {
      throw new Error(`console POST answered ${cmdRes.status()}: ${(await cmdRes.text()).slice(0, 300)}`);
    }
    const deadline = Date.now() + 45_000;
    let after = before;
    while (Date.now() < deadline) {
      after = await page.locator("div.font-mono > div").count();
      if (after > before) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (after <= before) {
      const streamPill = (await page.locator("button:has-text('Pause'), button:has-text('Resume')").first().textContent().catch(() => "?")) ?? "?";
      const tail = ((await page.locator("div.font-mono").first().textContent().catch(() => "")) ?? "").slice(-250);
      throw new Error(
        `console command "list" produced no new output lines within 45s (streamPill=${streamPill.trim()}, console tail: ${tail})`
      );
    }

    // --- Join Info modal tells the truth about where to connect. ---
    await page.getByRole("link", { name: "Servers", exact: true }).click();
    await card.waitFor({ timeout: 20_000 });
    await page
      .locator(`button[title="Invite friends or check why they can't join"]`)
      .click();
    const dialog = page.locator(`[role="dialog"][aria-label="Connection — ${SERVER_NAME}"]`);
    await dialog.waitFor({ timeout: 10_000 });
    const addressLabel = dialog.locator("span", { hasText: "Address" }).first();
    await addressLabel.waitFor({ timeout: 10_000 });
    const address = await dialog.locator("code").first().textContent();
    if (!address || !address.includes(":")) {
      throw new Error(`join info address looks wrong: "${address}"`);
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 10_000 });

    // --- Files button drives POST /api/system/open-folder (ledger: the one
    // route-method the API harness leaves to the GUI layer). The folder
    // exists after the first boot, so the route must answer ok:true. ---
    const openFolderResponse = page.waitForResponse(
      (res) => res.url().includes("/api/system/open-folder") && res.request().method() === "POST"
    );
    await card.getByRole("button", { name: "Files" }).click();
    const res = await openFolderResponse;
    const body = await res.json();
    if (!body.ok) {
      throw new Error(`/api/system/open-folder answered ok:false: ${JSON.stringify(body)}`);
    }

    // --- Clean stop: back to Offline. ---
    await card.getByRole("button", { name: "Stop", exact: true }).click();
    await waitForCardStatus(page, SERVER_NAME, [STATUS_LABELS.STOPPED], 60_000);
  }),
];
