import { test, expect } from "@playwright/test";

/**
 * Authenticated smoke flow: login → create a Minecraft server → open the
 * Game Settings tab → change a setting → save. Requires E2E_EMAIL and
 * E2E_PASSWORD (a real account in the Supabase project the app points at).
 * Skipped otherwise — CI runs only the @public specs.
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.skip(!EMAIL || !PASSWORD, "E2E_EMAIL / E2E_PASSWORD not set — skipping authenticated smoke");

test.describe("authenticated smoke", () => {
  test("login, create server, edit game settings", async ({ page }) => {
    // 1. Log in
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(EMAIL!);
    await page.locator('input[type="password"]').fill(PASSWORD!);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2. Seed builtin definitions and create a Minecraft server via the API
    //    (page.request shares the logged-in session's cookies).
    const defsRes = await page.request.get("/api/definitions");
    expect(defsRes.ok()).toBeTruthy();
    const defs = await defsRes.json();
    const minecraft = (defs.definitions || defs).find?.((d: any) => d.slug === "MINECRAFT");
    expect(minecraft, "MINECRAFT builtin definition should exist").toBeTruthy();

    const createRes = await page.request.post("/api/servers", {
      data: {
        name: "E2E Smoke Server",
        definitionId: minecraft.id,
        ramAllocation: 4,
        paramValues: {},
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const server = await createRes.json();

    // 3. Game Settings tab renders typed fields for the created server
    await page.goto(`/dashboard/config?server=${server.id}`);
    await page.getByRole("button", { name: /Game Settings/i }).click();
    await expect(page.getByText(/Max players/i).first()).toBeVisible();

    // 4. Change difficulty and save
    const difficulty = page.locator("select").first();
    await difficulty.selectOption("hard");
    await page.getByRole("button", { name: /Save Settings/i }).click();
    await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 15_000 });

    // 5. Reload and confirm the value persisted
    await page.goto(`/dashboard/config?server=${server.id}`);
    await page.getByRole("button", { name: /Game Settings/i }).click();
    await expect(page.locator("select").first()).toHaveValue("hard");
    // No cleanup needed: each run starts from a fresh throwaway e2e.db.
  });
});
