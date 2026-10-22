import { test, expect } from "@playwright/test";

/**
 * Public-surface smoke tests — no credentials needed, run in CI.
 * Tagged @public; CI runs `playwright test --grep @public`.
 */

test.describe("public surface @public", () => {
  test("login page renders with sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/RealmSwap/);
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("register page renders with signup form", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveTitle(/RealmSwap/);
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("dashboard requires authentication", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  test("API rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get("/api/servers");
    expect([401, 403]).toContain(res.status());
  });

  test("service worker is served with push + one-tap restart handler", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain("push");
    expect(body).toContain("notificationclick");
    expect(body).toContain("/restart");
  });

  test("VAPID public key is auto-provisioned without env keys", async ({ request }) => {
    const res = await request.get("/api/web-push/vapid");
    expect(res.ok()).toBeTruthy();
    const { publicKey } = await res.json();
    // P-256 raw public key, base64url, 65 bytes → 87 chars ending with '=' padding char
    expect(typeof publicKey).toBe("string");
    expect(publicKey.length).toBeGreaterThan(80);
  });
});
