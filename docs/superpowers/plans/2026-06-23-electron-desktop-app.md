# GameVault Desktop (Electron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Next.js + Node app as an installable Windows desktop application with tray/single-instance/minimize-to-tray niceties, without changing app behavior or auth.

**Architecture:** Electron's main process boots the Next.js app via Next's `standalone` build output, required in-process and listening on a random localhost port; a BrowserWindow loads it. All writable data (DB, installed servers, steamcmd, backups, archives) moves under a single resolver (`dataRoot()`) that points at the OS userData dir when packaged and `process.cwd()` in dev. Prisma uses the binary query engine to avoid Electron native-ABI issues.

**Tech Stack:** Electron, electron-builder, Next.js 14 (standalone output), Prisma (SQLite, binary engine), vitest.

## Global Constraints

- Platform target: **Windows x64 only** (NSIS installer).
- Auth is **unchanged** — do not modify login/register/JWT/serverAuth.
- Dev behavior must be **identical** to today: `npm run dev` + browser at `:3000`, data under `process.cwd()`.
- Do **not** edit generated Prisma files under `src/generated/client/**`.
- Node data paths must resolve through `dataRoot()` from `src/lib/appPaths.ts` — never `process.cwd()` directly in app code.
- Use `rtk` prefix for git/test/build commands per repo convention.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Writable data-root resolver (`appPaths.ts`)

**Files:**
- Create: `src/lib/appPaths.ts`
- Test: `src/lib/__tests__/appPaths.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `dataRoot(): string` — returns `process.env.GAMEVAULT_DATA_DIR` when set and non-empty, else `process.cwd()`.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/appPaths.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import path from "path";
import { dataRoot } from "../appPaths";

describe("dataRoot", () => {
  const original = process.env.GAMEVAULT_DATA_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.GAMEVAULT_DATA_DIR;
    else process.env.GAMEVAULT_DATA_DIR = original;
  });

  it("falls back to process.cwd() when GAMEVAULT_DATA_DIR is unset", () => {
    delete process.env.GAMEVAULT_DATA_DIR;
    expect(dataRoot()).toBe(process.cwd());
  });

  it("honors GAMEVAULT_DATA_DIR when set", () => {
    process.env.GAMEVAULT_DATA_DIR = path.join("C:", "fake", "data");
    expect(dataRoot()).toBe(path.join("C:", "fake", "data"));
  });

  it("ignores an empty GAMEVAULT_DATA_DIR", () => {
    process.env.GAMEVAULT_DATA_DIR = "";
    expect(dataRoot()).toBe(process.cwd());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/lib/__tests__/appPaths.test.ts`
Expected: FAIL — cannot resolve `../appPaths`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/appPaths.ts`:
```ts
/**
 * Root directory for all writable app data (database, installed servers,
 * steamcmd, backups, archives).
 *
 * In a packaged Electron build the main process sets GAMEVAULT_DATA_DIR to the
 * OS userData dir (e.g. %APPDATA%/GameVault). In dev / plain `next` runs the
 * variable is unset and we fall back to the current working directory, which
 * preserves the original behavior exactly.
 */
export function dataRoot(): string {
  const fromEnv = process.env.GAMEVAULT_DATA_DIR;
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv;
  }
  return process.cwd();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/lib/__tests__/appPaths.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/appPaths.ts src/lib/__tests__/appPaths.test.ts
rtk git commit -m "feat: add dataRoot() writable data-path resolver"
```

---

### Task 2: Route data paths through `dataRoot()`

Replace every `process.cwd()` data-path usage in app code with `dataRoot()`. All current usages are data-path construction, so a per-file replace-all is safe.

**Files (Modify):**
- `src/lib/localRunner.ts` (6 usages)
- `src/lib/backupService.ts` (2 usages)
- `src/app/api/servers/[id]/config/route.ts` (1 usage)
- `src/app/api/servers/[id]/archive/route.ts` (3 usages)
- `src/app/api/archives/[id]/restore/route.ts` (3 usages)
- `src/app/api/servers/[id]/import-world/route.ts` (5 usages)
- `src/app/api/servers/[id]/mods/install/route.ts` (6 usages)

**Interfaces:**
- Consumes: `dataRoot()` from `src/lib/appPaths.ts` (Task 1).
- Produces: no new exports; behavior unchanged when `GAMEVAULT_DATA_DIR` is unset.

- [ ] **Step 1: Add the import to each file**

For `src/lib/localRunner.ts` and `src/lib/backupService.ts`, add after the existing relative imports:
```ts
import { dataRoot } from "./appPaths";
```
For the four `src/app/api/.../route.ts` files, add (alongside the other `@/lib` or relative imports — match each file's existing import style; if it imports from `@/lib/...` use the first; otherwise use a relative path to `src/lib/appPaths`):
```ts
import { dataRoot } from "@/lib/appPaths";
```

- [ ] **Step 2: Replace `process.cwd()` with `dataRoot()` in each file**

In every listed file, replace each occurrence of `process.cwd()` with `dataRoot()`. Use editor replace-all per file. Verify zero remaining matches in app code:

Run: `rtk grep "process.cwd()" src/lib src/app`
Expected: no matches outside `src/generated/**`.

- [ ] **Step 3: Run the full test suite**

Run: `rtk npx vitest run`
Expected: PASS — same test count as before this task (the refactor is behavior-preserving in dev).

- [ ] **Step 4: Build to confirm no type/import errors**

Run: `rtk npm run build`
Expected: Next build completes (it will be reconfigured for standalone in Task 4; a plain successful build here is sufficient).

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/localRunner.ts src/lib/backupService.ts "src/app/api/servers/[id]/config/route.ts" "src/app/api/servers/[id]/archive/route.ts" "src/app/api/archives/[id]/restore/route.ts" "src/app/api/servers/[id]/import-world/route.ts" "src/app/api/servers/[id]/mods/install/route.ts"
rtk git commit -m "refactor: resolve data paths via dataRoot() instead of process.cwd()"
```

---

### Task 3: Prisma — env-based DB URL + binary engine + dev fallback

**Files:**
- Modify: `prisma/schema.prisma:8-16`
- Modify: `src/lib/db.ts`
- Create: `.env`

**Interfaces:**
- Consumes: `process.env.DATABASE_URL` (set by Electron main in Task 4; defaulted in dev here).
- Produces: a regenerated Prisma client using the binary engine; `prisma.$disconnect`-capable client unchanged in shape.

- [ ] **Step 1: Update the datasource and generator**

`prisma/schema.prisma` lines 8-16 become:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider   = "prisma-client-js"
  output     = "../src/generated/client"
  engineType = "binary"
}
```

- [ ] **Step 2: Add a dev/test default for DATABASE_URL in db.ts**

Edit `src/lib/db.ts` to guarantee a value when the env var is unset (dev, vitest, prisma CLI). New file content:
```ts
import { PrismaClient } from "../generated/client";

// In packaged Electron the main process sets DATABASE_URL to the userData DB
// before this module loads. In dev / tests it is usually unset, so default to
// the original local file to preserve existing behavior.
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
  process.env.DATABASE_URL = "file:./dev.db";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: Create `.env` for local dev**

`.env`:
```
DATABASE_URL="file:./dev.db"
```

- [ ] **Step 4: Regenerate the client and sync the dev DB**

Run: `rtk npx prisma generate`
Then: `rtk npx prisma db push`
Expected: client generated with binary engine; `prisma/dev.db` (or `dev.db`) in sync.

- [ ] **Step 5: Run tests to confirm green**

Run: `rtk npx vitest run`
Expected: PASS — same count as Task 2.

- [ ] **Step 6: Commit**

```bash
rtk git add prisma/schema.prisma src/lib/db.ts .env src/generated
rtk git commit -m "feat: use env DATABASE_URL and Prisma binary engine"
```

---

### Task 4: Electron main — in-process Next (standalone) + window

**Files:**
- Modify: `next.config.mjs`
- Modify: `package.json` (add `main`, deps, build script; scripts finalized in Task 7)
- Create: `electron/main.js`
- Create: `electron/preload.js`
- Create: `scripts/make-template-db.js`

**Interfaces:**
- Consumes: `dataRoot()` semantics via `GAMEVAULT_DATA_DIR`; Prisma via `DATABASE_URL` (Task 3).
- Produces: a launchable Electron app; `electron/main.js` exporting nothing (entrypoint). Globals it sets for the Next server: `PORT`, `HOSTNAME`, `NODE_ENV`, `GAMEVAULT_DATA_DIR`, `DATABASE_URL`, `GAMEVAULT_INTERNAL_TOKEN`.

- [ ] **Step 1: Enable standalone output**

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: Install Electron tooling**

Run:
```bash
rtk npm install --save-dev electron electron-builder cross-env concurrently wait-on
```
Expected: packages added to devDependencies.

- [ ] **Step 3: Add the Electron entrypoint field to package.json**

Add a top-level `"main": "electron/main.js"` key to `package.json` (next to `"private": true`).

- [ ] **Step 4: Create the preload script**

`electron/preload.js`:
```js
// Context isolation is on. The renderer talks to the local HTTP server, so no
// Node APIs are exposed here. Kept as an explicit, empty, audited surface.
"use strict";
```

- [ ] **Step 5: Create the main process**

`electron/main.js`:
```js
"use strict";
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const crypto = require("crypto");

const isDev = process.env.GAMEVAULT_DEV === "1";
const internalToken = crypto.randomBytes(16).toString("hex");

let mainWindow = null;
let serverPort = 0;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function ensureDataDir() {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  // First-run DB: copy the shipped template if the live DB is absent.
  const liveDb = path.join(dir, "gamevault.db");
  if (!fs.existsSync(liveDb)) {
    const template = path.join(process.resourcesPath, "template.db");
    if (fs.existsSync(template)) fs.copyFileSync(template, liveDb);
  }
  return dir;
}

function startNextServer(port, dataDir) {
  process.env.PORT = String(port);
  process.env.HOSTNAME = "127.0.0.1";
  process.env.NODE_ENV = "production";
  process.env.GAMEVAULT_DATA_DIR = dataDir;
  process.env.DATABASE_URL =
    "file:" + path.join(dataDir, "gamevault.db").replace(/\\/g, "/");
  process.env.GAMEVAULT_INTERNAL_TOKEN = internalToken;
  // Standalone server.js starts listening on PORT/HOSTNAME when required.
  require(path.join(process.resourcesPath, "standalone", "server.js"));
}

function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = require("http").get(
        { host: "127.0.0.1", port, path: "/", timeout: 1000 },
        (res) => {
          res.destroy();
          resolve();
        }
      );
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("Server did not start in time"));
        else setTimeout(tryOnce, 300);
      });
      req.on("timeout", () => req.destroy());
    };
    tryOnce();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const url = isDev
    ? "http://localhost:3000"
    : `http://127.0.0.1:${serverPort}`;
  await mainWindow.loadURL(url);
  mainWindow.show();
}

app.whenReady().then(async () => {
  try {
    if (isDev) {
      // next dev is started separately by the npm script; just open the window.
      await createWindow();
    } else {
      const dataDir = ensureDataDir();
      serverPort = await getFreePort();
      startNextServer(serverPort, dataDir);
      await waitForServer(serverPort, 30000);
      await createWindow();
    }
  } catch (err) {
    const { dialog } = require("electron");
    dialog.showErrorBox("GameVault failed to start", String(err && err.stack || err));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

module.exports = { getInternalToken: () => internalToken };
```

- [ ] **Step 6: Create the template-DB build script**

`scripts/make-template-db.js`:
```js
// Creates build/template.db: schema applied, no rows. Shipped in the installer
// and copied to userData on first launch.
"use strict";
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "..", "build", "template.db");
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) fs.unlinkSync(out);

execSync("npx prisma db push --skip-generate", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "file:" + out.replace(/\\/g, "/") },
});
console.log("Template DB created at", out);
```

- [ ] **Step 7: Verify the template DB script runs**

Run: `rtk node scripts/make-template-db.js`
Expected: `build/template.db` created; output ends with "Template DB created at ...".

- [ ] **Step 8: Verify a production-shaped boot manually**

Run: `rtk npm run build` (produces `.next/standalone` and `.next/static`).
Then stage standalone resources locally to mirror packaging and smoke the boot:
```bash
node -e "const fs=require('fs');const p=require('path');fs.cpSync('.next/standalone','.tmp-res/standalone',{recursive:true});fs.cpSync('.next/static','.tmp-res/standalone/.next/static',{recursive:true});if(fs.existsSync('public'))fs.cpSync('public','.tmp-res/standalone/public',{recursive:true});fs.copyFileSync('build/template.db','.tmp-res/template.db');"
```
Then launch with a faked resources path:
```bash
cross-env GAMEVAULT_DEV=0 ELECTRON_OVERRIDE_RESOURCES=1 npx electron .
```
NOTE: `process.resourcesPath` is only meaningful in a packaged app. For this manual check, temporarily run the packaged build from Task 6 instead if the staged path is not picked up. This step's intent: confirm the window opens and the dashboard renders. Cleanup: `rm -rf .tmp-res`.

- [ ] **Step 9: Commit**

```bash
rtk git add next.config.mjs package.json electron/main.js electron/preload.js scripts/make-template-db.js
rtk git commit -m "feat: electron main process boots Next standalone server in-process"
```

---

### Task 5: Desktop niceties — single-instance, tray, minimize-to-tray, menu, graceful shutdown

**Files:**
- Modify: `electron/main.js`
- Create: `electron/shutdown.js`
- Create: `build/tray.png`
- Create: `src/app/api/system/shutdown/route.ts`

**Interfaces:**
- Consumes: `serverPort`, `internalToken` from `electron/main.js`; `stopLocalServer` + `prisma` from app code.
- Produces: `POST /api/system/shutdown` — stops all RUNNING/STARTING local servers; requires header `x-internal-token` to match `process.env.GAMEVAULT_INTERNAL_TOKEN`; returns `{ stopped: number }`.

- [ ] **Step 1: Write the failing test for the shutdown route handler**

The route delegates to a pure helper so it is testable without HTTP. Create the test first.

`src/app/api/system/shutdown/__tests__/stopAll.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { stopAllRunningServers } from "../stopAll";

describe("stopAllRunningServers", () => {
  it("stops each running/starting server and returns the count", async () => {
    const find = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const stop = vi.fn().mockResolvedValue(undefined);
    const count = await stopAllRunningServers(find, stop);
    expect(count).toBe(2);
    expect(stop).toHaveBeenCalledWith("a");
    expect(stop).toHaveBeenCalledWith("b");
  });

  it("returns 0 when nothing is running", async () => {
    const find = vi.fn().mockResolvedValue([]);
    const stop = vi.fn();
    const count = await stopAllRunningServers(find, stop);
    expect(count).toBe(0);
    expect(stop).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/app/api/system/shutdown/__tests__/stopAll.test.ts`
Expected: FAIL — cannot resolve `../stopAll`.

- [ ] **Step 3: Implement the helper**

`src/app/api/system/shutdown/stopAll.ts`:
```ts
type ServerLite = { id: string };

export async function stopAllRunningServers(
  findRunning: () => Promise<ServerLite[]>,
  stop: (serverId: string) => Promise<void>
): Promise<number> {
  const servers = await findRunning();
  for (const s of servers) {
    try {
      await stop(s.id);
    } catch {
      // best-effort: a failed stop should not block quitting the app
    }
  }
  return servers.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run src/app/api/system/shutdown/__tests__/stopAll.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the route**

`src/app/api/system/shutdown/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stopLocalServer } from "@/lib/localRunner";
import { stopAllRunningServers } from "./stopAll";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-internal-token");
  if (!token || token !== process.env.GAMEVAULT_INTERNAL_TOKEN) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const stopped = await stopAllRunningServers(
    async () => {
      const rows = await prisma.server.findMany({
        where: { runnerType: "LOCAL", status: { in: ["RUNNING", "STARTING", "UPDATING"] } },
        select: { id: true },
      });
      return rows;
    },
    (id) => stopLocalServer(id)
  );

  return NextResponse.json({ stopped });
}
```
(If `@/lib/...` import alias is not configured, use relative paths: `../../../../lib/db` etc. Confirm by checking an existing route's import style first.)

- [ ] **Step 6: Create a placeholder tray icon**

Run (writes a 16×16 placeholder PNG):
```bash
node -e "const fs=require('fs');fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/tray.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVR42mNkYPhfz0BFwDiqYVTDcAAAVk0H/Yld8nMAAAAASUVORK5CYII=','base64'));"
```
Expected: `build/tray.png` exists.

- [ ] **Step 7: Add the shutdown helper module for the main process**

`electron/shutdown.js`:
```js
"use strict";
// Calls the in-app shutdown endpoint so running game servers are stopped
// before the app exits (Windows does not auto-kill child processes).
async function stopAllServers(port, token) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/system/shutdown`, {
      method: "POST",
      headers: { "x-internal-token": token },
    });
  } catch {
    // best-effort; proceed with quit regardless
  }
}
module.exports = { stopAllServers };
```

- [ ] **Step 8: Wire tray, single-instance, minimize-to-tray, menu, graceful quit into main.js**

In `electron/main.js`:

(a) Add to the require block at top:
```js
const { Tray, Menu, nativeImage } = require("electron");
const { stopAllServers } = require("./shutdown");
```

(b) Add module-level state near `let mainWindow = null;`:
```js
let tray = null;
let isQuitting = false;
```

(c) Enforce single instance — insert immediately before `app.whenReady()`:
```js
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
```

(d) In `createWindow()`, after `mainWindow = new BrowserWindow(...)`, add close-to-tray:
```js
mainWindow.on("close", (e) => {
  if (!isQuitting) {
    e.preventDefault();
    mainWindow.hide();
  }
});
```

(e) Add a tray + menu builder and call it from `createWindow()` after `mainWindow.show()`:
```js
function buildTray() {
  const icon = nativeImage.createFromPath(
    isDev ? require("path").join(__dirname, "..", "build", "tray.png")
          : require("path").join(process.resourcesPath, "tray.png")
  );
  tray = new Tray(icon);
  tray.setToolTip("GameVault");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open GameVault", click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: "separator" },
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on("double-click", () => { mainWindow.show(); mainWindow.focus(); });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [{ label: "Quit", click: () => { isQuitting = true; app.quit(); } }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
    { label: "Help", submenu: [{ role: "about" }] },
  ]));
}
```
Call `buildTray();` at the end of `createWindow()`.

(f) Replace the existing `window-all-closed` handler and add graceful quit:
```js
app.on("window-all-closed", () => {
  // Intentionally do nothing: closing the window hides to tray. Quit is
  // explicit via tray/menu.
});

app.on("before-quit", async (e) => {
  if (isQuitting && !isDev && serverPort) {
    e.preventDefault();
    await stopAllServers(serverPort, internalToken);
    isQuitting = "done";
    app.quit();
  }
});
```
Adjust the `before-quit` guard so the second `app.quit()` (after `isQuitting === "done"`) is not re-intercepted: the `isQuitting && ...` check is only true while `isQuitting === true`, so the `"done"` pass falls through and quits normally.

- [ ] **Step 9: Run the test suite**

Run: `rtk npx vitest run`
Expected: PASS — includes the new `stopAll` tests.

- [ ] **Step 10: Commit**

```bash
rtk git add electron/main.js electron/shutdown.js build/tray.png "src/app/api/system/shutdown/route.ts" "src/app/api/system/shutdown/stopAll.ts" "src/app/api/system/shutdown/__tests__/stopAll.test.ts"
rtk git commit -m "feat: tray, single-instance, minimize-to-tray, graceful server shutdown"
```

---

### Task 6: Packaging with electron-builder

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json` (build scripts — finalized in Task 7)

**Interfaces:**
- Consumes: `.next/standalone`, `.next/static`, `public`, `build/template.db`, `build/tray.png`, the Prisma binary engine.
- Produces: an NSIS installer in `dist/`.

- [ ] **Step 1: Identify the Prisma binary engine path**

Run: `rtk grep "query_engine" src/generated/client` and list `src/generated/client` for a file matching `query-engine-windows*.exe` / `query_engine-windows.dll.node`. With `engineType = "binary"` (Task 3) expect a `query-engine-windows.exe`. Note its exact filename for the `extraResources` mapping below.

- [ ] **Step 2: Write the electron-builder config**

`electron-builder.yml`:
```yaml
appId: com.gamevault.desktop
productName: GameVault
directories:
  output: dist
  buildResources: build
files:
  - electron/**/*
  - package.json
extraResources:
  - from: .next/standalone
    to: standalone
  - from: .next/static
    to: standalone/.next/static
  - from: public
    to: standalone/public
  - from: build/template.db
    to: template.db
  - from: build/tray.png
    to: tray.png
  - from: src/generated/client/query-engine-windows.exe
    to: standalone/src/generated/client/query-engine-windows.exe
win:
  target:
    - nsis
  artifactName: ${productName}-Setup-${version}.${ext}
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
asar: true
```
NOTE: if Step 1 shows the engine is `query_engine-windows.dll.node` (library engine) rather than `query-engine-windows.exe`, Task 3 did not take effect — re-run `rtk npx prisma generate` with `engineType = "binary"` before continuing. Update the `extraResources` engine line to the exact filename from Step 1.

- [ ] **Step 3: Confirm standalone bundles Prisma at the right relative path**

The standalone server resolves the Prisma client from `standalone/src/generated/client`. Verify after a build that `.next/standalone/src/generated/client` exists; if Next traced it elsewhere, adjust the `extraResources` `to:` path to match where `server.js` requires it from.

Run: `rtk npm run build` then `rtk ls .next/standalone/src/generated`
Expected: the generated client directory is present.

- [ ] **Step 4: Commit the config**

```bash
rtk git add electron-builder.yml
rtk git commit -m "build: electron-builder NSIS config with standalone + prisma engine"
```

---

### Task 7: Build/dev scripts + end-to-end packaging verification

**Files:**
- Modify: `package.json` (scripts)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: `npm run electron:dev`, `npm run electron:build`; installer in `dist/`.

- [ ] **Step 1: Add scripts to package.json**

Add to the `"scripts"` block:
```json
"electron:dev": "cross-env GAMEVAULT_DEV=1 concurrently -k \"next dev\" \"wait-on http://localhost:3000 && electron .\"",
"prepackage": "node scripts/make-template-db.js && next build",
"electron:build": "npm run prepackage && electron-builder"
```

- [ ] **Step 2: Ignore build artifacts**

Append to `.gitignore`:
```
dist/
build/template.db
.tmp-res/
```
(Keep `build/tray.png` tracked — do NOT ignore the whole `build/` dir.)

- [ ] **Step 3: Verify dev mode**

Run: `rtk npm run electron:dev`
Expected: Next dev compiles, an Electron window opens to the dashboard/login, tray icon appears. Close the window → it hides to tray; tray → Quit exits. Stop with Ctrl+C.

- [ ] **Step 4: Build the installer**

Run: `rtk npm run electron:build`
Expected: `dist/GameVault-Setup-0.1.0.exe` produced; no electron-builder errors about missing files.

- [ ] **Step 5: Manual smoke checklist (packaged)**

Install from `dist/`, then verify in order:
1. Launch → register a user → log in.
2. Create + start a server; confirm install/download progress renders and the process starts.
3. Confirm data lands under `%APPDATA%\GameVault` (`gamevault.db`, `local-servers/`).
4. Close window → hides to tray; server keeps running.
5. Tray → Quit → confirm the game-server process is stopped (Task Manager: no orphaned server/SteamCMD process).
6. Relaunch → previous data/login persists.

Record results in the PR description.

- [ ] **Step 6: Final commit**

```bash
rtk git add package.json .gitignore
rtk git commit -m "build: add electron dev/build scripts and ignore artifacts"
```

---

## Self-Review

**Spec coverage:**
- Runtime model (in-process Next) → Task 4. ✓
- Path resolver `appPaths.ts` → Task 1; call-site migration (7 files) → Task 2. ✓
- DB env URL + template-DB first-run → Task 3 (URL/engine), Task 4 (template script + first-run copy). ✓
- Single-instance / tray / minimize-to-tray / native menu / graceful shutdown → Task 5. ✓
- Packaging (electron-builder, NSIS, asarUnpack/extraResources for Prisma engine, template DB, icon) → Task 6. ✓
- Dev/build scripts → Task 7. ✓
- Auth unchanged → no task touches auth. ✓
- Testing (appPaths unit, suite green, manual smoke) → Tasks 1, 2, 5, 7. ✓
- Error handling (server-ready gate, port retry via free-port pick, first-run dialog) → Task 4. ✓

**Placeholder scan:** No TBD/TODO. Two intentional verify-and-adjust notes (Prisma engine filename in Task 6, import-alias style in Tasks 2/5) are concrete checks with exact commands, not deferred work.

**Type consistency:** `dataRoot()` signature consistent (Tasks 1–2). `stopAllRunningServers(find, stop)` signature matches between test, helper, and route (Task 5). `GAMEVAULT_INTERNAL_TOKEN` set in main (Task 4) and read in route (Task 5). `serverPort` used in main + shutdown helper (Tasks 4–5).
