/**
 * Configuration for the GUI e2e harness (Layer 2 of the zero-human test plan).
 *
 * The dev pass reuses the API harness's boot chain (scripts/e2e-api): a real
 * `next start` server on :3100 against a throwaway DB + fake Supabase, with
 * the Electron window pointed at it through GAMEVAULT_DEV_URL — so the
 * developer's :3000 dev server is never touched.
 *
 * The packaged pass builds the real mac app bundle (electron-builder --dir)
 * and boots it exactly like an installed copy, isolated from real user data
 * through GAMEVAULT_USER_DATA_DIR.
 */

import path from "path";
import { REPO_ROOT } from "../e2e-api/config";

/** Directory where reports + failure screenshots land (same data dir as the API harness). */
export const REPORT_DIR =
  process.env.E2E_API_DATA_DIR || "/tmp/realmswap-e2e-api-data";

/** Throwaway userData for the packaged boot pass (startup.log, realmswap.db, backups). */
export const PACKAGED_USER_DATA_DIR =
  process.env.E2E_GUI_USER_DATA_DIR || "/tmp/realmswap-e2e-gui-packaged-userdata";

/**
 * Throwaway userData for the dev pass — without this the dev electron reuses
 * ~/Library/Application Support/RealmSwap, whose persisted session cookie
 * auto-logs-in the next run against the fresh throwaway DB (the login scenario
 * would never see the login page).
 */
export const DEV_USER_DATA_DIR =
  process.env.E2E_GUI_DEV_USER_DATA_DIR || "/tmp/realmswap-e2e-gui-dev-userdata";

/** Where `electron-builder --dir` puts the mac app for the current arch. */
export const PACKAGED_APP_BUNDLE = path.join(
  REPO_ROOT,
  "dist",
  `mac-${process.arch}`,
  "RealmSwap.app"
);
export const PACKAGED_EXECUTABLE = path.join(
  PACKAGED_APP_BUNDLE,
  "Contents",
  "MacOS",
  "RealmSwap"
);

/** Wait for the packaged app's startup.log to report `server ready on port N`. */
export const PACKAGED_BOOT_TIMEOUT_MS = Number(
  process.env.E2E_GUI_PACKAGED_BOOT_TIMEOUT_MS || 90_000
);

/** Wait for a Minecraft server to reach Online through the UI (first run
 *  downloads the server jar + JRE; later runs reuse the runtimes cache). */
export const MC_BOOT_TIMEOUT_MS = Number(
  process.env.E2E_GUI_MC_BOOT_TIMEOUT_MS || 480_000
);

/** Wait for the app to exit after File → Quit. */
export const QUIT_TIMEOUT_MS = 20_000;
