# RealmSwap Marketing Site Extraction — Design

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan

## Problem

The marketing landing page lives at `src/app/page.tsx` (route `/`) inside the
Electron + Next.js desktop app. The desktop window never loads `/` — Electron
opens `/start`, which redirects to dashboard/login/register. So the landing page
is dead weight bundled inside the shipped desktop app, and there is no public
place for prospective users to learn about RealmSwap or download it.

## Goal

Extract the landing page into a standalone, publishable static site that serves
as the marketing + download page, hosted separately from the desktop app. The
desktop app stops shipping the landing page entirely.

## Non-goals

- No web-based auth/login/dashboard on the marketing site — it is purely
  marketing + download.
- No redesign of the page content/visuals beyond the button/auth changes below.
- No changes to the desktop app's behavior other than removing the now-unused
  `/` route and repointing any in-app links to it.

## Architecture

### Structure

A new self-contained Next.js app at **`/site`** (top-level folder, same repo):

- Its own `package.json` with `node_modules` (gitignored) — fully independent of
  the root desktop project's dependencies and build.
- `site/next.config.mjs` with `output: "export"`, `images.unoptimized: true`,
  and (for the GitHub Pages project subpath) `basePath: "/RealmSwap"` and
  `assetPrefix: "/RealmSwap"`.
- Copies of `tailwind.config.js`, `postcss.config.js`, and `globals.css` from
  the root project (the page depends on custom theme tokens/classes such as
  `accentPurple`, `glass-panel`, `text-glow-purple`, `animate-float`,
  `custom-scrollbar`, `borderDark`, `mutedText`).
- `site/app/layout.tsx` and `site/app/page.tsx` — the landing page, ported from
  `src/app/page.tsx`.
- `site/public/` — `logo.png` and `.nojekyll` (so GitHub Pages serves Next's
  `_next/` asset directories).

Because `/site` is a separate npm project in a sibling directory, the root
desktop build (`next build` with `output: "standalone"`), the root CI
(`npm test`), and `electron-builder` are completely unaffected. Next's root
build scans `src/app` and does not traverse `/site`.

### Desktop app changes

- Delete `src/app/page.tsx` (the `/` route the Electron window never loads).
- Audit the desktop app for any internal `Link href="/"` (e.g. header/footer
  logos in login/register/dashboard views) and repoint them to `/start` (the
  desktop entry route) so they don't become dead links once `/` is gone.

Net effect: the shipped desktop app no longer bundles marketing code; `/` exists
only on the public site.

## Content & download wiring

The page ports over nearly verbatim. Targeted changes, since the site has no web
auth:

- **Header**: remove the "Sign In" link. Change "Get Started" → "Download",
  pointing at the installer download URL.
- **Hero "Download Free"** and **CTA "Download Free Now"** → installer download
  URL.
- **Download URL**: defined once as a single constant and reused —
  `https://github.com/RealmSwap/RealmSwap/releases/latest/download/RealmSwap-Setup.exe`.
- **"All versions" link** beside the primary CTA → the releases page
  (`https://github.com/RealmSwap/RealmSwap/releases`).
- **Anchor links** (`#features`, `#demo`, `#faq`) and the interactive "Vault"
  demo widget: unchanged.
- **Footer** Terms/Privacy/Discord: left as-is (placeholder `#`) for now.
- **Asset references must be basePath-aware**: plain `<img src="/logo.png">`
  does NOT get `basePath` auto-prepended by Next (only `next/link` and
  `next/image` do). Route the logo (and any root-absolute asset) through the
  basePath — switch to `next/image` or prefix with a basePath constant.

### Installer artifact naming

To make `releases/latest/download/RealmSwap-Setup.exe` resolve to a stable URL,
change `electron-builder.yml`:

```
artifactName: ${productName}-Setup-${version}.${ext}   # before
artifactName: ${productName}-Setup.${ext}              # after
```

The version still lives in the Git/release tag and release title; only the asset
filename becomes stable.

## Hosting & deploy

- **GitHub Pages**, served from the default project URL
  `https://realmswap.github.io/RealmSwap/` (no custom domain yet).
- **New workflow** `.github/workflows/site.yml`: on push to `main` touching
  `site/**`, run `npm ci && npm run build` inside `/site`, then deploy
  `site/out/` via `actions/upload-pages-artifact` + `actions/deploy-pages`.
  Independent of the existing `ci.yml`.
- **No `CNAME`** file for now; `basePath`/`assetPrefix` of `/RealmSwap` handle
  the subpath.

### Adding realmswap.gg later

When the domain is purchased:

1. Remove `basePath` and `assetPrefix` from `site/next.config.mjs` (and remove
   the basePath prefixing of asset references / revert to root-absolute).
2. Add `site/public/CNAME` containing `realmswap.gg`.
3. Configure DNS at the registrar: apex `A`/`AAAA` records to GitHub Pages IPs
   (and/or a `CNAME` for `www` → `realmswap.github.io`).
4. Set the custom domain in the repo's Pages settings.

## Launch prerequisite (caveat)

The download button will return 404 until a GitHub Release containing
`RealmSwap-Setup.exe` is published. Publishing that first release is a launch
prerequisite, separate from deploying the site.

## Testing

- `cd site && npm run build` succeeds and produces `site/out/` with hashed
  `_next/` assets and a working `index.html`.
- Local smoke test (e.g. serve `site/out/` with basePath) confirms the page
  renders, the Vault demo interacts, and the download button points at the
  correct GitHub Releases URL.
- Root project: `npm test` and `next build` still pass after removing
  `src/app/page.tsx` (no dangling references to `/`).
