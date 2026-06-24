"use strict";
const { app, BrowserWindow, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const crypto = require("crypto");
const { stopAllServers } = require("./shutdown");

const isDev = process.env.GAMEVAULT_DEV === "1";
const internalToken = crypto.randomBytes(16).toString("hex");

let mainWindow = null;
let tray = null;
let isQuitting = false;
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
  // Prisma's generated client embeds the generation-time absolute path to the
  // query engine, which won't exist on the user's machine. Point it at the
  // engine that Task 6 bundles alongside standalone/.
  process.env.PRISMA_QUERY_ENGINE_BINARY = path.join(
    process.resourcesPath, "standalone", "src", "generated", "client", "query-engine-windows.exe"
  );
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

function buildTray() {
  const icon = nativeImage.createFromPath(
    isDev ? path.join(__dirname, "..", "build", "tray.png")
          : path.join(process.resourcesPath, "tray.png")
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

async function createWindow(port) {
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

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  const url = isDev
    ? "http://localhost:3000"
    : `http://127.0.0.1:${port}`;
  await mainWindow.loadURL(url);
  mainWindow.show();
  buildTray();
}

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
      await createWindow(serverPort);
    }
  } catch (err) {
    const { dialog } = require("electron");
    dialog.showErrorBox("GameVault failed to start", String(err && err.stack || err));
    app.quit();
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
