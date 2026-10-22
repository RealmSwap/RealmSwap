import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load .env when present so the Supabase stubs below only kick in when no
// real configuration exists (i.e. CI, which has no .env and no secrets).
dotenv.config();

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
      // The app's middleware throws (and every route 500s) when the Supabase
      // env vars are missing entirely. Well-formed stubs let the public
      // surface render in CI — session refresh just fails and is caught,
      // exactly like an unreachable project URL. Real .env values win locally.
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? {}
        : {
            NEXT_PUBLIC_SUPABASE_URL: "https://e2e-stub.supabase.co",
            NEXT_PUBLIC_SUPABASE_ANON_KEY:
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e2Utd3ViIn0.c3R1Yg",
          }),
    },
  },
});
