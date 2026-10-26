"use strict";
const fs = require("fs");
const path = require("path");

// Provider API keys the packaged app may carry. Allowlisted on purpose: the
// env file must never be able to inject operational variables like
// DATABASE_URL — only these two runtime-read provider keys.
const PROVIDER_KEY_NAMES = ["CURSEFORGE_API_KEY", "STEAM_API_KEY"];

/**
 * Fill provider API keys from packaged-env.json (written by the release
 * workflow into install resources) into `env`. Real environment variables
 * always win, so a user-set override keeps working. A missing file, invalid
 * JSON, or unusable values are silently skipped — startup must never depend
 * on this file. Returns the names that were applied.
 */
function loadPackagedEnv(resourcesPath, env = process.env) {
  const applied = [];
  let parsed;
  try {
    parsed = JSON.parse(
      fs.readFileSync(path.join(resourcesPath, "packaged-env.json"), "utf8")
    );
  } catch {
    return applied;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return applied;
  }
  for (const name of PROVIDER_KEY_NAMES) {
    const value = parsed[name];
    if (typeof value === "string" && value.trim() && env[name] === undefined) {
      env[name] = value.trim();
      applied.push(name);
    }
  }
  return applied;
}

module.exports = { loadPackagedEnv, PROVIDER_KEY_NAMES };
