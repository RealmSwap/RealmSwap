"use strict";
// Release-build step: collect the provider API keys from the build environment
// and write packaged-env.json for electron-builder to bundle into the
// installer's resources (electron/packagedEnv.js loads it on startup).
// Missing keys emit a GitHub warning but do not fail the build — the packaged
// app degrades to keyless provider behavior (no CurseForge results, curated
// Workshop list), never to a broken install.
const fs = require("fs");
const path = require("path");
const { PROVIDER_KEY_NAMES } = require("../electron/packagedEnv");

const collected = {};
for (const name of PROVIDER_KEY_NAMES) {
  const value = (process.env[name] || "").trim();
  if (value) {
    collected[name] = value;
  } else {
    console.log(
      `::warning::${name} is not set in the build environment — the packaged app ` +
        `will ship without it (that provider's search degrades; the app still works).`
    );
  }
}

const target = process.argv[2] || path.join(__dirname, "..", "packaged-env.json");
fs.writeFileSync(target, JSON.stringify(collected, null, 2) + "\n");
console.log(
  `packaged-env.json written to ${target} ` +
    `(${Object.keys(collected).length} of ${PROVIDER_KEY_NAMES.length} provider keys)`
);
