"use strict";
// ---------------------------------------------------------------------------
// App update notifications (electron-updater).
//
// Flow: the app checks the update server (build.publish in package.json) ~30 s
// after start and then every 4 hours. If a newer version exists the renderer
// shows a small banner. Nothing is downloaded or installed until the shop
// owner says so, and a sale is never interrupted. If the owner downloads an
// update but never clicks "Restart", it installs when the app is closed.
//
// Offline is normal for this app: failed checks are silent.
//
// State sent to the UI ("updater:state"):
//   status: disabled | idle | checking | available | downloading | downloaded | error
//   currentVersion, version (new one), percent, error
// ---------------------------------------------------------------------------

const FIRST_CHECK_MS = 30 * 1000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

function createUpdater({ app, getWindow, beforeInstall, autoUpdater: injected }) {
  let state = { status: "idle", currentVersion: app.getVersion(), version: null, percent: 0, error: null };
  let au = injected || null;

  function setState(patch) {
    state = { ...state, ...patch };
    const win = getWindow && getWindow();
    if (win && !win.isDestroyed()) win.webContents.send("updater:state", state);
  }

  if (!au) {
    if (!app.isPackaged) {
      state.status = "disabled"; // dev mode
    } else {
      try {
        au = require("electron-updater").autoUpdater;
      } catch (err) {
        console.error("electron-updater not available:", err);
        state.status = "disabled";
      }
    }
  }

  if (!au) {
    return { getState: () => state, check() {}, download() {}, install() {}, stop() {} };
  }

  au.autoDownload = false; // owner decides
  au.autoInstallOnAppQuit = true; // downloaded but not installed -> installs when the app closes
  au.allowPrerelease = false;
  au.logger = console;

  au.on("checking-for-update", () => {
    if (state.status === "idle" || state.status === "error") setState({ status: "checking", error: null });
  });
  au.on("update-available", (info) => {
    if (state.status === "downloading" || state.status === "downloaded") return;
    setState({ status: "available", version: info.version, percent: 0, error: null });
  });
  au.on("update-not-available", () => {
    if (state.status === "checking") setState({ status: "idle", version: null });
  });
  au.on("download-progress", (p) => setState({ status: "downloading", percent: Math.round(p.percent || 0) }));
  au.on("update-downloaded", (info) => setState({ status: "downloaded", version: info.version, percent: 100 }));
  au.on("error", (err) => {
    const message = String((err && err.message) || err);
    console.error("Updater error:", message);
    if (state.status === "downloading") setState({ status: "error", error: message });
    else if (state.status === "checking") setState({ status: "idle", error: message }); // offline etc: stay quiet
  });

  function check() {
    if (state.status === "downloading" || state.status === "downloaded" || state.status === "available") return;
    Promise.resolve(au.checkForUpdates()).catch(() => {});
  }
  function download() {
    if (state.status !== "available" && state.status !== "error") return;
    setState({ status: "downloading", percent: 0, error: null });
    Promise.resolve(au.downloadUpdate()).catch((err) =>
      setState({ status: "error", error: String((err && err.message) || err) }),
    );
  }
  function install() {
    if (state.status !== "downloaded") return;
    try {
      if (beforeInstall) beforeInstall(); // safety snapshot of the database
    } catch (err) {
      console.error("Pre-update backup failed:", err);
    }
    au.quitAndInstall(true, true); // silent install, relaunch afterwards
  }

  const first = setTimeout(check, FIRST_CHECK_MS);
  const every = setInterval(check, CHECK_EVERY_MS);
  if (first.unref) first.unref();
  if (every.unref) every.unref();

  return {
    getState: () => state,
    check,
    download,
    install,
    stop() {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}

module.exports = { createUpdater };
