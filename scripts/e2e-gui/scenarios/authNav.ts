/**
 * gui/auth-and-shell — the real login form against the real /api/auth/login
 * route (fake Supabase behind it), then the dashboard shell + every sidebar
 * page renders its heading. Billing is disabled in the harness env, so its
 * nav link must bounce back to the dashboard.
 */

import { navigateAndExpect, scenario } from "../framework";
import { ADMIN_USER } from "../../e2e-api/config";

export const authAndShellScenarios = [
  scenario("gui/auth-and-shell", "login form, dashboard shell, sidebar sweep, billing gate", ["smoke"], async (ctx) => {
    const { page } = ctx;

    // Fresh DB → /start redirects to /login.
    await page.getByRole("heading", { name: "Welcome Back" }).waitFor({ timeout: 20_000 });

    // Bad credentials → the login route's exact 401 message, rendered inline
    // (not a toast) by src/app/login/page.tsx.
    await page.getByPlaceholder("name@domain.com").fill(ADMIN_USER.email);
    await page.getByPlaceholder("••••••••").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Log In" }).click();
    await page.getByText("Invalid email or password").waitFor({ timeout: 15_000 });

    // Good credentials → dashboard renders with the first-run wizard.
    await page.getByPlaceholder("name@domain.com").fill(ADMIN_USER.email);
    await page.getByPlaceholder("••••••••").fill(ADMIN_USER.password);
    await page.getByRole("button", { name: "Log In" }).click();
    await page.getByRole("heading", { name: "Active Servers" }).waitFor({ timeout: 20_000 });
    await page.getByRole("heading", { name: "Deploy your first server" }).waitFor({ timeout: 20_000 });

    // Sidebar sweep: every nav page renders its heading.
    await navigateAndExpect(page, "Marketplace", "Community Marketplace");
    await navigateAndExpect(page, "Mod Manager", "Mod & Plugin Manager");
    await navigateAndExpect(page, "World Backups", "World Backups");
    await navigateAndExpect(page, "Server Config", "Server Configuration Editor");
    await navigateAndExpect(page, "Automation", "Automation");
    await navigateAndExpect(page, "Remote Hosts", "Remote Hosts");
    await navigateAndExpect(page, "Server Console", "Live Server Console");
    await navigateAndExpect(page, "Audit Logs", "Audit Security Logs");
    await navigateAndExpect(page, "Game Players", "Game Players");
    await navigateAndExpect(page, "Team", "Team");
    await navigateAndExpect(page, "Storage", "Storage");

    // Billing disabled (BILLING_ENABLED=0) → the page hard-redirects home.
    await page.getByRole("link", { name: "Billing", exact: true }).click();
    await page.getByRole("heading", { name: "Active Servers" }).waitFor({ timeout: 20_000 });
    if (page.url().includes("/dashboard/billing")) {
      throw new Error(`billing page should redirect home when disabled, still at ${page.url()}`);
    }
  }),
];
