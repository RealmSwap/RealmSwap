/**
 * Configuration for the API e2e harness (Layer 1 of the zero-human test plan).
 *
 * The app under test boots on its own port against a throwaway SQLite DB and a
 * throwaway data dir, with a local fake Supabase in place of the real project —
 * so auth is exercised through the app's REAL login route and session cookies
 * without touching Supabase (no rate limits, no emails, CI-safe).
 *
 * The fake issues HS256 access tokens signed with the same secret the app runs
 * under (SUPABASE_JWT_SECRET), which the app verifies through its offline local
 * verification path (src/lib/supabase/verifyLocal.ts) — a documented production
 * feature, not a test backdoor.
 */

import path from "path";

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Port the app under test listens on (:3100 — :3000 stays free for the dev server). */
export const APP_PORT = intEnv("E2E_API_PORT", 3100);
export const APP_BASE_URL = `http://127.0.0.1:${APP_PORT}`;

/** Throwaway SQLite file the app runs against (prisma db push target). */
export const DB_FILE = path.join(REPO_ROOT, "prisma", "e2e-api.db");
export const DATABASE_URL = `file:${DB_FILE}`;

/** App data dir (local-servers, runtimes cache, logs). local-servers and
 *  local-archives are wiped per run; runtimes/ is kept so the Temurin JRE and
 *  any SteamCMD setup survive between runs. */
export const DATA_DIR = process.env.E2E_API_DATA_DIR || "/tmp/realmswap-e2e-api-data";

/** Isolated build output so `next build` never clobbers a running dev server's .next. */
export const DIST_DIR = process.env.E2E_API_DIST_DIR || ".next-e2e";

/** Rebuild even when the source hash is unchanged. */
export const FORCE_REBUILD = boolEnv("E2E_API_REBUILD");

/** Fixed port for the fake Supabase (kept stable so build-baked values are harmless). */
export const FAKE_SUPABASE_PORT = intEnv("E2E_FAKE_SUPABASE_PORT", 3199);
export const FAKE_SUPABASE_URL = `http://127.0.0.1:${FAKE_SUPABASE_PORT}`;
export const FAKE_SUPABASE_ANON_KEY = "e2e-anon-key-not-a-real-jwt";
export const SUPABASE_JWT_SECRET = "e2e-api-harness-jwt-secret";

/** Internal token handed to the app so the harness can exercise /api/system/shutdown. */
export const INTERNAL_TOKEN = "e2e-api-harness-internal-token";

export const ADMIN_USER = {
  email: "e2e-admin@realmswap.test",
  password: "e2e-admin-password",
  name: "E2E Admin",
};

export const MEMBER_USER = {
  email: "e2e-member@realmswap.test",
  password: "e2e-member-password",
  name: "E2E Member",
};

/** How long to wait for the game server to reach RUNNING (first run downloads
 *  the MC server jar + provisions a JRE; later runs reuse the runtimes cache). */
export const BOOT_TIMEOUT_MS = intEnv("E2E_API_BOOT_TIMEOUT_MS", 480_000);

/** Health-wait for the Next server itself. */
export const APP_START_TIMEOUT_MS = intEnv("E2E_API_APP_START_TIMEOUT_MS", 120_000);
