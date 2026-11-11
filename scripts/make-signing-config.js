// Builds the electron-builder config for THIS build: electron-builder.yml
// verbatim, plus the Windows signing block when signing is configured via the
// environment.
//
// The signing options have to live in the config itself — electron-builder
// activates Azure Trusted Signing purely on `win.azureSignOptions` being
// present, and the values (a publisher display name, most notably) can't ride
// CLI flags: publisher names have spaces and Windows npm shims don't survive
// that. So every build — local, smoke, release — consumes the generated file
// through one code path (package.json's electron:build), and signing turns on
// by the environment alone:
//
//   Azure Trusted (Artifact) Signing — repo variables AZURE_SIGNING_ENDPOINT,
//     AZURE_SIGNING_ACCOUNT, AZURE_SIGNING_PROFILE, AZURE_SIGNING_PUBLISHER
//     plus secrets AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET.
//     The credentials are read by the TrustedSigning PowerShell module
//     electron-builder drives (Azure EnvironmentCredential).
//   Classic certificate — secrets CSC_LINK / CSC_KEY_PASSWORD; electron-builder
//     signs on its own when CSC_LINK is set (nothing to merge here).
//
// With FORCE_CODE_SIGNING=true but no signing configured, the config refuses
// to build unsigned — used where an unsigned release must fail loudly.
//
// See docs/code-signing.md for the full runbook.
"use strict";
const fs = require("fs");
const YAML = require("yaml");

const AZURE_KEYS = [
  "AZURE_SIGNING_ENDPOINT",
  "AZURE_SIGNING_ACCOUNT",
  "AZURE_SIGNING_PROFILE",
  "AZURE_SIGNING_PUBLISHER",
];

const out = process.argv[2] || "electron-builder.effective.yml";

const config = YAML.parse(fs.readFileSync("electron-builder.yml", "utf8"));
if (!config || typeof config !== "object") {
  throw new Error("electron-builder.yml is not a YAML mapping");
}

const azureValues = AZURE_KEYS.map((k) => process.env[k] ?? "");
const azure = azureValues.every(Boolean);
if (azure) {
  config.win = config.win ?? {};
  config.win.azureSignOptions = {
    endpoint: azureValues[0],
    codeSigningAccountName: azureValues[1],
    certificateProfileName: azureValues[2],
    publisherName: azureValues[3],
  };
  config.forceCodeSigning = true;
}
if (process.env.FORCE_CODE_SIGNING === "true" && !azure) {
  config.forceCodeSigning = true;
}

fs.writeFileSync(out, YAML.stringify(config));
console.log(`[make-signing-config] wrote ${out} (azure signing: ${azure ? "on" : "off"}, forceCodeSigning: ${config.forceCodeSigning ?? false})`);
