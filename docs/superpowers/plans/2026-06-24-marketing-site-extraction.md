# Marketing Site Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the RealmSwap landing page into a standalone Next.js static-export site at `/site`, deployed to GitHub Pages, and remove the landing page from the shipped desktop app.

**Architecture:** A new self-contained Next.js app in `/site` with its own `package.json`/`node_modules`, building to a static `site/out/` via `output: "export"`. It reuses the existing Tailwind theme and `globals.css`. The desktop app (root project) drops its unused `/` route. A GitHub Actions workflow builds and deploys `/site` to GitHub Pages at the `/RealmSwap` project subpath.

**Tech Stack:** Next.js 14 (App Router, static export), React 18, Tailwind CSS 3, lucide-react, GitHub Actions, GitHub Pages.

## Global Constraints

- Site lives in top-level `/site` as a separate npm project; `node_modules`, `.next`, `out` gitignored. Must not affect root desktop build, root CI (`npm test`), or `electron-builder`.
- GitHub Pages project subpath: site `next.config.mjs` MUST set `basePath: "/RealmSwap"` and `assetPrefix: "/RealmSwap"`.
- Root-absolute asset references (e.g. `logo.png`) are NOT auto-prefixed by Next for raw `<img>` tags — prefix them with the `/RealmSwap` base manually.
- Download URL constant (verbatim): `https://github.com/RealmSwap/RealmSwap/releases/latest/download/RealmSwap-Setup.exe`
- Releases page URL (verbatim): `https://github.com/RealmSwap/RealmSwap/releases`
- Installer artifact filename MUST be version-less (`RealmSwap-Setup.exe`) so the download URL resolves.
- No web auth on the site: remove "Sign In"; CTAs point at the download URL.
- Repo: `RealmSwap/RealmSwap`. Default branch: `main`.

---

### Task 1: Scaffold the `/site` static-export Next app

**Files:**
- Create: `site/package.json`
- Create: `site/next.config.mjs`
- Create: `site/tsconfig.json`
- Create: `site/postcss.config.js`
- Create: `site/tailwind.config.js`
- Create: `site/app/globals.css`
- Create: `site/app/layout.tsx`
- Create: `site/app/page.tsx` (temporary placeholder, replaced in Task 2)
- Create: `site/public/.nojekyll`
- Create: `site/public/logo.png` (copied from root `public/logo.png`)
- Modify: `.gitignore`

**Interfaces:**
- Produces: a buildable site project. `cd site && npm run build` emits `site/out/index.html` and `site/out/_next/`. Task 2 replaces `site/app/page.tsx` with the real landing page.

- [ ] **Step 1: Create `site/package.json`**

```json
{
  "name": "realmswap-site",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "lucide-react": "^0.395.0",
    "next": "^14.2.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: Create `site/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: "/RealmSwap",
  assetPrefix: "/RealmSwap",
  images: { unoptimized: true },
};

export default nextConfig;
```

- [ ] **Step 3: Create `site/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `site/postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create `site/tailwind.config.js`**

This is the root `tailwind.config.js` with the `content` globs repointed at the site's own files. Copy the theme verbatim:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#08090c",
        card: "#12141c",
        cardHover: "#1b1e2a",
        accentPurple: "#8b5cf6",
        accentPurpleHover: "#a78bfa",
        accentBlue: "#0ea5e9",
        accentBlueHover: "#38bdf8",
        successGreen: "#10b981",
        warningYellow: "#f59e0b",
        dangerRed: "#ef4444",
        mutedText: "#94a3b8",
        borderDark: "#1f2937",
        borderPurple: "rgba(139, 92, 246, 0.2)",
        borderPurpleHover: "rgba(139, 92, 246, 0.4)",
      },
      animation: {
        "pulse-glow": "pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "shimmer": "shimmer 2.5s infinite linear",
        "float": "float 3s ease-in-out infinite",
        "slide-down": "slideDown 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.5s ease-out",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: 0.8, boxShadow: "0 0 15px rgba(139, 92, 246, 0.4)" },
          "50%": { opacity: 1, boxShadow: "0 0 25px rgba(139, 92, 246, 0.8)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "cyber-grid": "radial-gradient(circle, rgba(139, 92, 246, 0.05) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 6: Create `site/app/globals.css`**

Copy the root `src/app/globals.css` verbatim:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-background text-white antialiased;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  }
}

/* Custom Scrollbars */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #08090c;
}

::-webkit-scrollbar-thumb {
  background: #1f2937;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #8b5cf6;
}

/* Custom animations & design systems */
.glass-panel {
  background: rgba(18, 20, 28, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.glass-panel-purple {
  background: rgba(18, 20, 28, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(139, 92, 246, 0.15);
}

.text-glow-purple {
  text-shadow: 0 0 10px rgba(139, 92, 246, 0.6);
}

.text-glow-cyan {
  text-shadow: 0 0 10px rgba(14, 165, 233, 0.6);
}

.box-glow-purple {
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.3);
}

.box-glow-purple:hover {
  box-shadow: 0 0 25px rgba(139, 92, 246, 0.3);
  border-color: rgba(139, 92, 246, 0.5);
}

.cyber-grid-bg {
  background-size: 40px 40px;
  background-image: linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
}
```

- [ ] **Step 7: Create `site/app/layout.tsx`**

Like the root layout but WITHOUT `ModalProvider` (app-only) — the marketing page uses no modals:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RealmSwap | Host Locally. Play Globally",
  description: "Manage your local game servers with ease. With RealmSwap, swap between Minecraft, Valheim, Project Zomboid, and ARK instantly.",
  keywords: ["game server hosting", "minecraft hosting", "valheim server", "project zomboid server", "game server backups"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-white antialiased cyber-grid-bg">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create placeholder `site/app/page.tsx`**

Temporary — replaced wholesale in Task 2. Just enough to build:

```tsx
export default function LandingPage() {
  return <main className="min-h-screen" />;
}
```

- [ ] **Step 9: Create `site/public/.nojekyll`**

Empty file (prevents GitHub Pages from stripping `_next/` directories):

```bash
touch site/public/.nojekyll
```

- [ ] **Step 10: Copy the logo asset into the site**

```bash
cp public/logo.png site/public/logo.png
```

- [ ] **Step 11: Add site build artifacts to `.gitignore`**

Append to root `.gitignore` (the existing `/out/` and `/.next/` are root-anchored and do NOT cover `site/`):

```
# Marketing site (separate Next project)
/site/.next/
/site/out/
/site/next-env.d.ts
```

(`node_modules` is already ignored globally without a leading slash, so `site/node_modules` is covered.)

- [ ] **Step 12: Install deps and build**

Run:
```bash
cd site && npm install && npm run build
```
Expected: build completes; `site/out/index.html` and `site/out/_next/` exist. Verify:
```bash
ls site/out/index.html && ls site/out/_next
```
Expected: both paths listed, no error.

- [ ] **Step 13: Commit**

```bash
git add site/package.json site/package-lock.json site/next.config.mjs site/tsconfig.json site/postcss.config.js site/tailwind.config.js site/app site/public .gitignore
git commit -m "feat(site): scaffold static-export marketing site project"
```

---

### Task 2: Port the landing page and wire download buttons

**Files:**
- Modify: `site/app/page.tsx` (replace placeholder with the ported landing page)

**Interfaces:**
- Consumes: the Tailwind theme, `globals.css`, and `/RealmSwap`-prefixed `logo.png` from Task 1.
- Produces: the final static landing page. The built `site/out/index.html` contains the download URL and contains no in-app auth links.

Port `src/app/page.tsx` into `site/app/page.tsx`, then apply the edits below. Start by copying the file verbatim:

```bash
cp src/app/page.tsx site/app/page.tsx
```

- [ ] **Step 1: Add config constants below the imports**

Immediately after the `import { ... } from "lucide-react";` block (before `const GAMES_LIST`), insert:

```tsx
// Static-site config. The desktop installer is published as a version-less
// asset on GitHub Releases so this "latest" URL is always valid.
const DOWNLOAD_URL =
  "https://github.com/RealmSwap/RealmSwap/releases/latest/download/RealmSwap-Setup.exe";
const RELEASES_URL = "https://github.com/RealmSwap/RealmSwap/releases";
// GitHub Pages serves this project at the /RealmSwap subpath. Raw <img> tags are
// not auto-prefixed by Next's basePath, so prefix root-absolute assets manually.
const ASSET_PREFIX = "/RealmSwap";
```

- [ ] **Step 2: Convert the header logo `<Link href="/">` to a non-link image**

There is no `/` route on the marketing site, so the logo should not be a link. Replace (around line 96-98):

```tsx
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/logo.png" alt="RealmSwap" className="h-10 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </Link>
```

with:

```tsx
          <div className="flex items-center gap-2 group">
            <img src={`${ASSET_PREFIX}/logo.png`} alt="RealmSwap" className="h-10 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </div>
```

- [ ] **Step 3: Remove the "Sign In" link and repoint "Get Started" in the header**

Replace the header CTA block (around line 106-116):

```tsx
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-semibold hover:text-accentPurple transition-colors px-3 py-2">
              Sign In
            </Link>
            <Link 
              href="/register" 
              className="bg-accentPurple hover:bg-accentPurpleHover text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-md shadow-accentPurple/20 border border-accentPurple/30"
            >
              Get Started
            </Link>
          </div>
```

with:

```tsx
          <div className="flex items-center gap-4">
            <a
              href={DOWNLOAD_URL}
              className="bg-accentPurple hover:bg-accentPurpleHover text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-md shadow-accentPurple/20 border border-accentPurple/30"
            >
              Download
            </a>
          </div>
```

- [ ] **Step 4: Repoint the hero CTA + add an "all versions" link**

Replace the hero button block (around line 142-156):

```tsx
        <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-md mb-16">
          <Link 
            href="/register" 
            className="w-full sm:w-auto bg-accentPurple hover:bg-accentPurpleHover text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 shadow-lg shadow-accentPurple/20 border border-accentPurple/40"
          >
            Download Free
          </Link>
          <a 
            href="#demo" 
            className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5 text-yellow-400" />
            See How it Works
          </a>
        </div>
```

with:

```tsx
        <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-md mb-4">
          <a
            href={DOWNLOAD_URL}
            className="w-full sm:w-auto bg-accentPurple hover:bg-accentPurpleHover text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 shadow-lg shadow-accentPurple/20 border border-accentPurple/40"
          >
            Download Free
          </a>
          <a 
            href="#demo" 
            className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5 text-yellow-400" />
            See How it Works
          </a>
        </div>
        <a
          href={RELEASES_URL}
          className="text-xs text-mutedText hover:text-white transition-colors mb-16"
        >
          All versions &amp; release notes
        </a>
```

- [ ] **Step 5: Repoint the bottom CTA "Download Free Now"**

Replace (around line 385-390):

```tsx
        <Link 
          href="/register" 
          className="inline-block bg-accentPurple hover:bg-accentPurpleHover text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 shadow-lg shadow-accentPurple/20 border border-accentPurple/40"
        >
          Download Free Now
        </Link>
```

with:

```tsx
        <a
          href={DOWNLOAD_URL}
          className="inline-block bg-accentPurple hover:bg-accentPurpleHover text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 shadow-lg shadow-accentPurple/20 border border-accentPurple/40"
        >
          Download Free Now
        </a>
```

- [ ] **Step 6: Repoint the footer logo image**

Replace (around line 397):

```tsx
            <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
```

with:

```tsx
            <img src={`${ASSET_PREFIX}/logo.png`} alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
```

- [ ] **Step 7: Remove the now-unused `next/link` import**

All `<Link>` usages are gone. Delete this line near the top:

```tsx
import Link from "next/link";
```

- [ ] **Step 8: Build and verify the output**

Run:
```bash
cd site && npm run build
```
Expected: build succeeds with no "Link is not defined" or unused-import errors.

Then verify the wiring landed in the static HTML:
```bash
grep -c "releases/latest/download/RealmSwap-Setup.exe" site/out/index.html
grep -c "Sign In" site/out/index.html
grep -c "/register" site/out/index.html
```
Expected: first command ≥ 1; second and third both `0`.

- [ ] **Step 9: Commit**

```bash
git add site/app/page.tsx
git commit -m "feat(site): port landing page and wire GitHub Releases download links"
```

---

### Task 3: De-version the installer artifact name

**Files:**
- Modify: `electron-builder.yml:36`

**Interfaces:**
- Produces: a stable installer filename `RealmSwap-Setup.exe`, which the Task 2 `DOWNLOAD_URL` depends on.

- [ ] **Step 1: Change `artifactName`**

In `electron-builder.yml`, under `win:`, replace:

```yaml
  artifactName: ${productName}-Setup-${version}.${ext}
```

with:

```yaml
  artifactName: ${productName}-Setup.${ext}
```

- [ ] **Step 2: Verify the change**

Run:
```bash
grep "artifactName" electron-builder.yml
```
Expected output: `  artifactName: ${productName}-Setup.${ext}` (no `${version}`).

- [ ] **Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "build: use version-less installer filename for stable download URL"
```

---

### Task 4: Remove the landing page from the desktop app

**Files:**
- Delete: `src/app/page.tsx`
- Modify: `src/app/login/page.tsx:55`
- Modify: `src/app/register/page.tsx:52`
- Modify: `src/app/forgot-password/page.tsx:54`

**Interfaces:**
- Consumes: nothing. The desktop Electron window loads `/start`, never `/`.
- Produces: a desktop app with no `/` route and no dangling links to it.

- [ ] **Step 1: Delete the landing page route**

```bash
git rm src/app/page.tsx
```

- [ ] **Step 2: Repoint the in-app logo links from `/` to `/start`**

In each of `src/app/login/page.tsx`, `src/app/register/page.tsx`, and `src/app/forgot-password/page.tsx`, the logo is a `<Link href="/" ...>`. Change the `href` to `/start` (the desktop entry route). For each file, replace:

```tsx
<Link href="/" className="flex items-center gap-2 mb-2 group">
```

with:

```tsx
<Link href="/start" className="flex items-center gap-2 mb-2 group">
```

(Note: `login/page.tsx` uses the same `<Link href="/" className="flex items-center gap-2 mb-2 group">` markup as the others — apply the identical change in all three files.)

- [ ] **Step 3: Confirm no remaining in-app links to `/`**

Run:
```bash
grep -rn 'href="/"' src/app
```
Expected: no output (exit code 1) — every `href="/"` has been removed or repointed.

- [ ] **Step 4: Verify the desktop app still builds and tests pass**

Run:
```bash
npm test
npm run build
```
Expected: `npm test` passes (Vitest, all green); `next build` completes with no error about a missing `/` page or broken `Link`.

- [ ] **Step 5: Commit**

```bash
git add -A src/app
git commit -m "refactor: remove marketing landing page from desktop app"
```

---

### Task 5: Add the GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/site.yml`

**Interfaces:**
- Consumes: the buildable `/site` project (Tasks 1-2). Builds `site/out/` and deploys it to GitHub Pages.

- [ ] **Step 1: Create `.github/workflows/site.yml`**

```yaml
name: Deploy Site

on:
  push:
    branches: [main]
    paths:
      - "site/**"
      - ".github/workflows/site.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: site
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: site/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Build static site
        run: npm run build

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site/out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate the workflow YAML**

Run (parses the file to confirm it is valid YAML):
```bash
node -e "require('js-yaml')" 2>/dev/null && npx js-yaml .github/workflows/site.yml > /dev/null && echo "valid yaml" || python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/site.yml')); print('valid yaml')"
```
Expected: prints `valid yaml`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/site.yml
git commit -m "ci: deploy marketing site to GitHub Pages"
```

- [ ] **Step 4: Post-merge manual step (document, do not automate)**

After this lands on `main`, a human must enable Pages once in the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The first deploy publishes to `https://realmswap.github.io/RealmSwap/`. The download button 404s until a GitHub Release containing `RealmSwap-Setup.exe` is published (launch prerequisite from the spec).

---

## Notes for the implementer

- **Adding `realmswap.gg` later** (not part of this plan): remove `basePath`/`assetPrefix` from `site/next.config.mjs`, revert the `ASSET_PREFIX` constant to `""`, add `site/public/CNAME` with `realmswap.gg`, set the custom domain in Pages settings, and configure registrar DNS.
- All work happens on the current worktree branch; no changes to the root `package.json`, `next.config.mjs`, or `ci.yml`.
