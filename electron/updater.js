"use strict";
// Electron-side glue: supplies the real autoUpdater (electron-updater) and dialog
// to the pure controller in ./autoUpdate. Only ever called in packaged builds.
const { dialog } = require("electron");
const { createUpdater } = require("./autoUpdate");

let controller = null;

function initAutoUpdate({ getMainWindow, beginQuit, refreshTrayMenu }) {
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  controller = createUpdater({
    autoUpdater,
    dialog,
    getMainWindow,
    beginQuit,
    refreshTrayMenu,
  });
  controller.start();
  return controller;
}

function checkForUpdatesManual() {
  if (controller) controller.checkManual();
}

function restartToUpdate() {
  if (controller) controller.applyUpdate();
}

function isUpdateStaged() {
  return controller ? controller.isStaged() : false;
}

module.exports = {
  initAutoUpdate,
  checkForUpdatesManual,
  restartToUpdate,
  isUpdateStaged,
};
