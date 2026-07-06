"use strict";
const { app, BrowserWindow, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const crypto = require("crypto");
const { stopAllServers } = require("./shutdown");
const {
  initAutoUpdate,
  attemptRecoveryUpdate,
  checkForUpdatesManual,
  restartToUpdate,
  isUpdateStaged,
} = require("./updater");
const { runMigrations } = require("./migrate");

const isDev = process.env.GAMEVAULT_DEV === "1";
const internalToken = crypto.randomBytes(16).toString("hex");

// Brand the app as RealmSwap. Must run before any app.getPath("userData") so
// the data directory resolves to %APPDATA%/RealmSwap.
app.setName("RealmSwap");

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("realmsync", process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient("realmsync");
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let serverPort = 0;

function beginQuit() {
  isQuitting = true;
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

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
  const liveDb = path.join(dir, "realmswap.db");
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
    "file:" + path.join(dataDir, "realmswap.db").replace(/\\/g, "/");
  process.env.GAMEVAULT_INTERNAL_TOKEN = internalToken;
  // Prisma's generated client embeds the generation-time absolute path to the
  // query engine, which won't exist on the user's machine. Point it at the
  // engine that Task 6 bundles alongside standalone/.
  process.env.PRISMA_QUERY_ENGINE_BINARY = path.join(
    process.resourcesPath, "standalone", "src", "generated", "client", "query-engine-windows.exe"
  );
  // Standalone server.js starts listening on PORT/HOSTNAME when required.
  require(path.join(process.resourcesPath, "standalone", "server.js"));
}

function makeMigrationClient(dbUrl) {
  const enginePath = path.join(
    process.resourcesPath, "standalone", "src", "generated", "client", "query-engine-windows.exe"
  );
  process.env.PRISMA_QUERY_ENGINE_BINARY = enginePath;
  const { PrismaClient } = require(
    path.join(process.resourcesPath, "standalone", "src", "generated", "client")
  );
  return new PrismaClient({ datasources: { db: { url: dbUrl } } });
}

function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = require("http").get(
        { host: "127.0.0.1", port, path: "/start", timeout: 1000 },
        (res) => {
          if (res.statusCode >= 500) {
            res.destroy();
            if (Date.now() > deadline) reject(new Error("Server returned " + res.statusCode));
            else setTimeout(tryOnce, 300);
            return;
          }
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

function buildTrayMenu() {
  const items = [
    { label: "Open RealmSwap", click: showMainWindow },
    { type: "separator" },
    { label: "Check for updates", click: () => checkForUpdatesManual() },
  ];
  if (isUpdateStaged()) {
    items.push({ label: "Restart to update", click: () => restartToUpdate() });
  }
  items.push({ type: "separator" });
  items.push({ label: "Quit", click: () => { beginQuit(); app.quit(); } });
  return items;
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu()));
}

function buildTray() {
  const icon = nativeImage.createFromPath(
    isDev ? path.join(__dirname, "..", "build", "tray.png")
          : path.join(process.resourcesPath, "tray.png")
  );
  tray = new Tray(icon);
  tray.setToolTip("RealmSwap");
  refreshTrayMenu();
  tray.on("double-click", showMainWindow);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [{ label: "Quit", click: () => { beginQuit(); app.quit(); } }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
    { label: "Help", submenu: [{ role: "about" }] },
  ]));
}

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Open to the desktop entry route, which redirects to dashboard (valid
  // session), login (users exist), or register (fresh install) — not the
  // marketing landing page at /.
  // Also pass any deep link query parameters to /start.
  const deepLinkArg = process.argv.find(arg => arg.startsWith("realmsync://"));
  let url = isDev
    ? "http://localhost:3000/start"
    : `http://127.0.0.1:${port}/start`;
    
  if (deepLinkArg) {
    url += `?link=${encodeURIComponent(deepLinkArg)}`;
  }
  
  await mainWindow.loadURL(url);
  mainWindow.show();
  buildTray();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      
      const deepLinkArg = commandLine.find(arg => arg.startsWith("realmsync://"));
      if (deepLinkArg) {
        const url = isDev 
          ? `http://localhost:3000/start?link=${encodeURIComponent(deepLinkArg)}` 
          : `http://127.0.0.1:${serverPort}/start?link=${encodeURIComponent(deepLinkArg)}`;
        mainWindow.loadURL(url);
      }
    }
  });
}

app.whenReady().then(async () => {
  try {
    if (isDev) {
      // next dev is started separately by the npm script; just open the window.
      await createWindow();
    } else {
      const dataDir = ensureDataDir();
      await runMigrations({
        dbPath: path.join(dataDir, "realmswap.db"),
        migrationsDir: path.join(process.resourcesPath, "migrations"),
        backupDir: path.join(dataDir, "backups"),
        makeClient: makeMigrationClient,
      });
      serverPort = await getFreePort();
      startNextServer(serverPort, dataDir);
      await waitForServer(serverPort, 30000);
      await createWindow(serverPort);
      initAutoUpdate({
        getMainWindow: () => mainWindow,
        beginQuit,
        refreshTrayMenu,
      });
    }
  } catch (err) {
    // Startup failed. In packaged builds, give the app one bounded chance to
    // pull a fixing update before giving up — otherwise a bad release bricks
    // the install with no way to self-heal.
    let recovered = false;
    if (!isDev) {
      try {
        const outcome = await attemptRecoveryUpdate({ beginQuit, timeoutMs: 30000 });
        recovered = outcome === "applied";
      } catch (e) {
        console.error("[updater] recovery attempt failed:", e);
      }
    }
    if (!recovered) {
      const { dialog } = require("electron");
      const backup = err && err.backupPath;
      const detail = String((err && err.stack) || err) +
        (backup ? `\n\nYour data is safe. A backup was saved to:\n${backup}` : "");
      dialog.showErrorBox("RealmSwap failed to start", detail);
      app.quit();
    }
  }
});

app.on("window-all-closed", () => {
  // Intentionally do nothing: closing the window hides to tray. Quit is
  // explicit via tray/menu.
});

app.on("before-quit", async (e) => {
  if (isQuitting === true && !isDev && serverPort) {
    e.preventDefault();
    isQuitting = "done";
    await stopAllServers(serverPort, internalToken);
    app.quit();
  }
});

module.exports = { getInternalToken: () => internalToken };
