// Context isolation is on. The renderer talks to the local HTTP server, so
// no Node APIs are exposed here. The only bridge surface is the dedicated-box
// launch-at-login pair — app-level OS settings the renderer cannot reach
// otherwise. Kept as an explicit, minimal, audited surface.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("realmswapDesktop", {
  getLaunchOnBoot: () => ipcRenderer.invoke("launch-on-boot:get"),
  setLaunchOnBoot: (enable) => ipcRenderer.invoke("launch-on-boot:set", enable),
});
