const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const license = require("./license.cjs");

const isDev = !app.isPackaged;
const DEV_URL = process.env.ELECTRON_START_URL || "http://localhost:5173";

let mainWindow = null;
let settingsWindow = null;
let serverProcess = null;
let serverPort = null;

function configPath() {
  return path.join(app.getPath("userData"), "printer-config.json");
}
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return { deviceName: "", paperWidthMm: 80 };
  }
}
function writeConfig(partial) {
  const next = { ...readConfig(), ...partial };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next), "utf8");
  return next;
}

// App data (products/sales/customers/settings) — plain JSON file. The
// window loads from a fresh random local port every launch, so browser
// localStorage (scoped per protocol+host+port) looks empty every restart.
// This file, independent of the port, is what makes data actually persist.
function dataPath() {
  return path.join(app.getPath("userData"), "pos-data.json");
}
function readData() {
  try {
    return JSON.parse(fs.readFileSync(dataPath(), "utf8"));
  } catch {
    return null;
  }
}
function writeData(data) {
  fs.mkdirSync(path.dirname(dataPath()), { recursive: true });
  const tmp = dataPath() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, dataPath());
  return true;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1500 }, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("Server did not start in time"));
        else setTimeout(tryOnce, 250);
      });
      req.on("timeout", () => req.destroy());
    };
    tryOnce();
  });
}

// Matches package.json → build.extraResources: { from: ".output", to: "output" }
// This exact path match is critical — a mismatch here was the cause of a
// previous "app runs in Task Manager but no window appears" bug: the
// server file could never be found, so it never started, so the window's
// ready-to-show event never fired.
async function startProductionServer() {
  serverPort = await getFreePort();
  const serverEntry = path.join(process.resourcesPath, "output", "server", "index.mjs");
  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox(
      "Jnex POS — startup error",
      `Could not find the built server at:\n${serverEntry}\n\nThis usually means "npm run build" wasn't run before packaging, or the extraResources path in package.json doesn't match this file.`,
    );
    app.quit();
    return;
  }
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, PORT: String(serverPort), HOST: "127.0.0.1", ELECTRON_RUN_AS_NODE: "1" },
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForServer(serverPort);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: "#1E1E1E",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => (mainWindow = null));
  const url = isDev ? DEV_URL : `http://127.0.0.1:${serverPort}/`;
  mainWindow.loadURL(url);
}

// Small window (opened from the "Printer" menu) for picking the Windows
// printer + paper width used for silent receipt printing. Uses its own
// preload (settings-preload.cjs) so it only ever gets access to the
// printer IPC channels, not the full posData/posHardware bridge.
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 420,
    parent: mainWindow || undefined,
    resizable: false,
    title: "Receipt printer settings",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "settings-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: "Printer",
      submenu: [
        { label: "Select receipt printer…", click: () => createSettingsWindow() },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Single-instance lock — without this, double-clicking the app (or a
// stray second launch) opens a second window writing to the same
// pos-data.json file at the same time, which can clobber sales data.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    if (!isDev) {
      await startProductionServer();
      if (!serverProcess) return;
    }
    createWindow();
  });

  app.on("window-all-closed", () => {
    if (serverProcess) serverProcess.kill();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    if (serverProcess) serverProcess.kill();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

ipcMain.handle("printers:get-config", () => readConfig());
ipcMain.handle("printers:set-config", (_evt, partial) => writeConfig(partial));
ipcMain.handle("printers:list", async () => {
  if (!mainWindow) return [];
  const printers = await mainWindow.webContents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, isDefault: p.isDefault }));
});

ipcMain.handle("data:load", () => readData());
ipcMain.handle("data:save", (_evt, data) => writeData(data));

ipcMain.handle("license:get", () => license.getLicenseState());
ipcMain.handle("license:activate", (_evt, code) => license.activate(code));

function printSaleSilently(sale, cfg) {
  return new Promise((resolve) => {
    const { buildReceiptHtml } = require("./receipt-template.cjs");
    const receiptWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    const html = buildReceiptHtml(sale, cfg.paperWidthMm || 80);
    receiptWin
      .loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html))
      .then(() => {
        receiptWin.webContents.print(
          {
            silent: true,
            deviceName: cfg.deviceName || undefined,
            margins: { marginType: "none" },
            printBackground: true,
          },
          (success, errorType) => {
            receiptWin.destroy();
            resolve({ ok: success, error: success ? undefined : errorType });
          },
        );
      })
      .catch((e) => {
        receiptWin.destroy();
        resolve({ ok: false, error: String(e) });
      });
  });
}

// Fallback used if silent printing fails (e.g. no printer configured yet,
// or the configured printer was unplugged/renamed) — opens the normal OS
// print dialog so the cashier can still print manually instead of the
// sale silently failing to produce a receipt.
function printSaleWithDialog(sale, cfg) {
  return new Promise((resolve) => {
    const { buildReceiptHtml } = require("./receipt-template.cjs");
    const receiptWin = new BrowserWindow({ show: false });
    const html = buildReceiptHtml(sale, cfg.paperWidthMm || 80);
    receiptWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    receiptWin.webContents.once("did-finish-load", () => {
      receiptWin.webContents.print({ silent: false, printBackground: true }, (success) => {
        receiptWin.destroy();
        resolve({ ok: success });
      });
    });
  });
}

ipcMain.handle("print:receipt", async (_evt, sale) => {
  if (!mainWindow) return { ok: false, error: "No window" };
  const cfg = readConfig();
  const result = await printSaleSilently(sale, cfg);
  if (!result.ok) {
    const fallback = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["Open print dialog", "Cancel"],
      defaultId: 0,
      message: "Couldn't print silently to the configured printer.",
      detail: "Check Printer > Select receipt printer…, or print manually now.",
    });
    if (fallback.response === 0) return printSaleWithDialog(sale, cfg);
  }
  return result;
});
