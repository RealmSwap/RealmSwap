# Code signing the Windows installer

`RealmSwap-Setup.exe` ships unsigned today: SmartScreen shows "Windows
protected your PC" on first run, and the auto-updater can only integrity-check
downloads (SHA-512 in `latest.yml`) rather than verify who signed them. This
runbook turns signing on. It is designed so that **signing activates purely by
environment**: nothing in the repo needs to change on the day you buy
whatever certificate you choose, and a machine without signing configured
keeps building exactly as before.

## What signing does and does not do

Signing gives every installer and every staged update a verified publisher
identity and tamper-evidence. What it does **not** do (since Microsoft's 2024
Trusted Root Program change) is buy an instant SmartScreen pass: EV
certificates no longer grant automatic reputation, and a freshly signed app
still shows "Windows protected your PC" until real-world installs build
reputation over time. Plan for the warning to persist for a while after
signing starts — the install docs below set that expectation for users, and
reputation accumulates from every download either way.

## Option A — Azure Trusted Signing (rebranded "Azure Artifact Signing")

Microsoft's hosted signing service: no certificate file to safeguard, ~$10
/month, certificates renew themselves. Eligibility is restricted: individuals
located in the **US or Canada**, and (since the April 2025 preview update)
organizations with **3+ years of verifiable history**. If that doesn't fit,
use Option B.

1. In the Azure portal create a **Trusted Signing** account (resource group +
   account) and a **certificate profile** (Public Trust), and complete the
   identity validation for the publisher name you want on the binaries.
2. Create an App registration with a client secret that has the Trusted
   Signing **Code Signer** role on the account.
3. In this GitHub repo, set:
   - **Variables** (Settings → Secrets and variables → Actions → Variables):
     - `AZURE_SIGNING_ENDPOINT` — the regional endpoint, e.g.
       `https://eus.codesigning.azure.net/`
     - `AZURE_SIGNING_ACCOUNT` — the account name
     - `AZURE_SIGNING_PROFILE` — the certificate profile name
     - `AZURE_SIGNING_PUBLISHER` — the validated publisher display name
       (electron-builder also writes this into `app-update.yml`, so the
       auto-updater verifies future updates against it)
   - **Secrets**: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
4. Set the repo variable `EXPECT_SIGNED_INSTALLER=true`. From then on, the
   release workflow and the Windows smoke **fail** if the produced installer
   is not validly signed as that publisher — switching signing on can't
   silently regress.
5. Cut a release and check the run summary: each workflow prints
   `Installer signature: Valid — CN=…`.

## Option B — classic certificate (OV/EV, a `.pfx` file)

Set the standard electron-builder secrets: `CSC_LINK` (the PFX, base64 or a
URL) and `CSC_KEY_PASSWORD`. electron-builder signs by itself when `CSC_LINK`
is present; `scripts/make-signing-config.js` doesn't need to merge anything,
and `EXPECT_SIGNED_INSTALLER=true` enforces the outcome as above.

## How the wiring works

`package.json`'s `electron:build` runs every build — local, Windows smoke,
release — through `scripts/make-signing-config.js`, which writes
`electron-builder.effective.yml` (gitignored): `electron-builder.yml`
verbatim, plus `win.azureSignOptions` + `forceCodeSigning` when the Azure
variables and secrets are all present. The options must live in the config
file (they can't survive Windows npm-shim quoting on a CLI flag), and
activation must be config-driven (electron-builder's Azure manager engages
purely on `win.azureSignOptions` being present; credentials are read from
`AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` by the
TrustedSigning PowerShell module it drives).

For a local end-to-end rehearsal with your own values:

```powershell
$env:AZURE_SIGNING_ENDPOINT = "https://eus.codesigning.azure.net/"
# … the rest of the variables/secrets …
npm run electron:build
Get-AuthenticodeSignature .\dist\RealmSwap-Setup.exe
```

## What the user sees

- **Unsigned** (today): SmartScreen "Windows protected your PC" with
  "Unknown publisher"; the user clicks More info → Run anyway. The install
  docs say so explicitly.
- **Signed, early days**: same warning, but "Verified publisher: <you>".
  Reputation builds with download volume and time.
- **Every release** also publishes `SHA256SUMS.txt`; users on any OS can
  verify a download with
  `Get-FileHash .\RealmSwap-Setup.exe -Algorithm SHA256` (Windows) or
  `sha256sum RealmSwap-Setup.exe` and compare against it — worth pointing
  people at while SmartScreen reputation is still building.

## Unsigned → signed transition

Existing installs are unsigned, and an unsigned electron-updater does not
verify signatures — they take the signed update normally. From the first
signed install onward, the updater checks each staged update's signature
against the configured publisher, so a tampered or mis-signed artifact is
rejected at update time. Keep `AZURE_SIGNING_PUBLISHER` stable across
certificate renewals: it is the identity the updater pins.

## Sources

- SmartScreen reputation for Windows app developers (no more EV fast-pass):
  <https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation>
- Trusted Signing preview update (April 2025 eligibility):
  <https://techcommunity.microsoft.com/blog/microsoft-security-blog/trusted-signing-public-preview-update/4399713>
- Trusted Signing for individual developers:
  <https://techcommunity.microsoft.com/blog/microsoft-security-blog/trusted-signing-is-now-open-for-individual-developers-to-sign-up-in-public-previ/4273554>
- Azure Artifact Signing product page:
  <https://azure.microsoft.com/en-us/products/artifact-signing>
