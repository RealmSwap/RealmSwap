# Release Publishing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tag-driven GitHub Actions workflow that builds the Windows installer and publishes it as a GitHub Release asset, so `releases/latest/download/RealmSwap-Setup.exe` resolves and the marketing download button works.

**Architecture:** One new workflow `.github/workflows/release.yml`, independent of `ci.yml` (tests) and `site.yml` (Pages). It triggers on `v*` tag pushes (or manual `workflow_dispatch` with a `version` input), resolves the version, writes it into `package.json` at build time, builds the NSIS installer on a Windows runner, and publishes a non-draft GitHub Release with `dist/RealmSwap-Setup.exe` attached.

**Tech Stack:** GitHub Actions, `windows-latest` runner, Node 20, electron-builder (NSIS), `softprops/action-gh-release@v2`.

## Global Constraints

- New file only: `.github/workflows/release.yml`. Do NOT modify `ci.yml` or `site.yml`.
- Triggers: push tags matching `v*`, plus `workflow_dispatch` with a required `version` input.
- Version source of truth is the tag/input; written into `package.json` at build time via `npm version $VERSION --no-git-tag-version --allow-same-version` (never committed back).
- Tag-push version = `GITHUB_REF_NAME` with leading `v` stripped. Dispatch version = the `version` input. `TAG` = `v$VERSION` in both cases.
- Job: `runs-on: windows-latest`, `permissions: contents: write`.
- Build command: `npm run electron:build`, with env `DATABASE_URL: file:./dev.db` (because `.env` is gitignored and absent on CI; `next build` and `make-template-db.js` reference `DATABASE_URL`). Produces `dist/RealmSwap-Setup.exe`.
- Publish with `softprops/action-gh-release@v2`: `tag_name: $TAG`, `name: $TAG`, `draft: false`, `prerelease: false`, `files: dist/RealmSwap-Setup.exe`, authenticated via the built-in `GITHUB_TOKEN`.
- Installer artifact name stays version-less (`RealmSwap-Setup.exe`).
- Atomicity: the publish step runs only after a successful build (a failed build must never create a public release).

---

### Task 1: Add the release publishing workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Produces: a workflow that, on `v*` tag push or `workflow_dispatch`, builds and publishes a GitHub Release with `RealmSwap-Setup.exe`. No other task depends on it.

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:
    inputs:
      version:
        description: "Version to release, without the leading v (e.g. 0.1.0)"
        required: true
        type: string

permissions:
  contents: write

jobs:
  release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Resolve version and tag
        id: ver
        shell: bash
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            VERSION="${{ github.event.inputs.version }}"
          else
            VERSION="${GITHUB_REF_NAME#v}"
          fi
          if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-.+].*)?$'; then
            echo "Invalid version '$VERSION' — expected semver like 0.1.0" >&2
            exit 1
          fi
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "tag=v$VERSION" >> "$GITHUB_OUTPUT"

      - name: Install dependencies
        run: npm ci

      - name: Set package version
        run: npm version ${{ steps.ver.outputs.version }} --no-git-tag-version --allow-same-version

      - name: Build Windows installer
        env:
          DATABASE_URL: file:./dev.db
        run: npm run electron:build

      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.ver.outputs.tag }}
          name: ${{ steps.ver.outputs.tag }}
          draft: false
          prerelease: false
          files: dist/RealmSwap-Setup.exe
```

Notes for the implementer:
- The `Resolve version and tag` step uses `shell: bash` explicitly because `windows-latest` defaults to PowerShell; the rest of the steps are shell-agnostic.
- `softprops/action-gh-release@v2` defaults its `token` to `${{ github.token }}`, so no explicit token wiring is needed beyond the `permissions: contents: write` block.
- On `workflow_dispatch` (no pre-existing tag), the action creates the tag from `tag_name` on the checked-out commit. On a tag push, `tag_name` matches the pushed tag.

- [ ] **Step 2: Validate the workflow YAML parses**

Run (use whichever validator is available; Node `js-yaml` is present in the repo's dependency tree, Python may not be):

```bash
node -e "const y=require('js-yaml'),f=require('fs');y.load(f.readFileSync('.github/workflows/release.yml','utf8'));console.log('valid yaml')"
```

Expected output: `valid yaml`

If `js-yaml` is not resolvable from the repo root, fall back to:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('valid yaml')"
```

Expected output: `valid yaml`

- [ ] **Step 3: Confirm scope — no other workflow files changed**

Run:

```bash
git status --porcelain .github/workflows
```

Expected: only `.github/workflows/release.yml` shows as added (`?? .github/workflows/release.yml`); `ci.yml` and `site.yml` must NOT appear.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: build and publish Windows installer to GitHub Releases on tag"
```

---

## Manual verification (human-triggered — NOT an implementer step)

A release workflow cannot be unit-tested; the real test is cutting a release,
which publishes a public artifact. The person owning the repo runs this after the
workflow lands on `main`:

1. Ensure GitHub Actions is enabled for the repo (Settings → Actions → General →
   Allow all actions, if not already).
2. Cut the first release, either:
   - **Tag push:** `git tag v0.1.0 && git push origin v0.1.0`, or
   - **Manual:** Actions → "Release" → "Run workflow" → `version: 0.1.0`.
3. Confirm:
   - the "Release" workflow run completes green;
   - release `v0.1.0` is published (not draft) with `RealmSwap-Setup.exe` attached;
   - `https://github.com/RealmSwap/RealmSwap/releases/latest/download/RealmSwap-Setup.exe`
     downloads the installer (the marketing site's download button now works).

Note: the installer is unsigned, so Windows SmartScreen will warn on first run —
expected, a known limitation (no code-signing certificate).
