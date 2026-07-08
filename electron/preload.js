// Context isolation is on. The renderer talks to the local HTTP server, so no
// Node APIs are exposed here. Kept as an explicit, empty, audited surface.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  getAutoStart: () => ipcRenderer.invoke("get-autostart"),
  setAutoStart: (enabled) => ipcRenderer.invoke("set-autostart", enabled),
});
