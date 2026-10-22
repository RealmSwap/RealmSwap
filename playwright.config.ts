import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Two tiers:
 *
 * - @public specs need no credentials and run everywhere (including CI).
 * - auth specs need E2E_EMAIL / E2E_PASSWORD — a real account in the Supabase
 *   project the app points at (NEXT_PUBLIC_SUPABASE_* in .env). They skip
 *   automatically when the variables are unset.
 *
 * The app under test runs on its own port with its own throwaway SQLite file
 * (prisma/e2e.db), so a test run never touches dev.db.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // one app instance, one browser — no parallel servers
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "rm -f prisma/e2e.db && npx prisma db push --skip-generate && npx next dev -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: "file:./e2e.db",
      // Keep the app's data writes (e.g. auto-provisioned VAPID key file) out
      // of the repo during test runs.
      GAMEVAULT_DATA_DIR: "/tmp/realmswap-e2e-data",
    },
  },
});
