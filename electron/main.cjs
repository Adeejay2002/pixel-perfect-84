const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const { createUpdater } = require("./updater.cjs");
const drawer = require("./drawer.cjs");
const restoreTools = require("./restore.cjs");

// Driver-mode printing: older thermal drivers can't take Chromium's XPS print
// path and print garbage. No effect if the feature doesn't exist.
app.commandLine.appendSwitch("disable-features", "UseXpsForPrinting");

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
// --- SQLite database ----------------------------------------------------------
// Main storage is <userData>/pos.db (see db.cjs). If SQLite cannot be loaded
// for any reason, the app falls back to the old pos-data.json file so the shop
// can keep selling.
let posDb = null;
let writesBlocked = false; // set if the database could not be read: never overwrite it
let pausedForReload = false; // after a restore, until the window has reloaded the restored data

function initDatabase() {
  try {
    const { createStore } = require("./db.cjs");
    posDb = createStore(path.join(app.getPath("userData"), "pos.db"), backupDir());
    const res = posDb.importLegacyJson(dataPath());
    if (res.imported) console.log("Imported legacy pos-data.json into SQLite");
  } catch (err) {
    console.error("SQLite unavailable, using pos-data.json fallback:", err);
    posDb = null;
  }
}

// --- App updates -------------------------------------------------------------
let updater = null;

// Snapshot taken right before an update is installed. Keeps the newest 5.
function preUpdateBackup() {
  fs.mkdirSync(backupDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (posDb) {
    posDb.backupTo(path.join(backupDir(), `pre-update-${stamp}.db`));
  } else if (fs.existsSync(dataPath())) {
    fs.copyFileSync(dataPath(), path.join(backupDir(), `pre-update-${stamp}.json`));
  }
  const old = fs
    .readdirSync(backupDir())
    .filter((f) => /^pre-update-/.test(f))
    .sort();
  while (old.length > 5) fs.unlinkSync(path.join(backupDir(), old.shift()));
}

ipcMain.handle("updater:get-state", () => (updater ? updater.getState() : { status: "disabled" }));
ipcMain.handle("updater:check", () => updater && updater.check());
ipcMain.handle("updater:download", () => updater && updater.download());
ipcMain.handle("updater:install", () => updater && updater.install());

// --- Backups screen (list / preview / restore) -------------------------------
ipcMain.handle("backups:list", () => (posDb ? restoreTools.listBackups(backupDir()) : []));

ipcMain.handle("backups:inspect", (_evt, name) => {
  if (!posDb) return { ok: false, error: "Database backups are not available" };
  const { openDatabase, MIGRATIONS } = require("./db.cjs");
  return restoreTools.inspectBackup({ backupDir: backupDir(), name: String(name || ""), openDatabase, maxVersion: MIGRATIONS.length });
});

ipcMain.handle("backups:create", () => {
  if (!posDb) return { ok: false, error: "Database backups are not available" };
  try {
    return { ok: true, name: restoreTools.createManualBackup(posDb, backupDir()) };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle("backups:open-folder", async () => {
  fs.mkdirSync(backupDir(), { recursive: true });
  const err = await shell.openPath(backupDir());
  return err ? { ok: false, error: err } : { ok: true };
});

ipcMain.handle("backups:restore", (_evt, name, actor) => {
  if (!posDb) return { ok: false, error: "Database backups are not available" };
  const { createStore, openDatabase, MIGRATIONS } = require("./db.cjs");
  const result = restoreTools.restoreBackup({
    store: posDb,
    dbFile: path.join(app.getPath("userData"), "pos.db"),
    backupDir: backupDir(),
    name: String(name || ""),
    createStore,
    openDatabase,
    maxVersion: MIGRATIONS.length,
    actor: actor || {},
  });
  posDb = result.store; // null only if even the old database could not be reopened
  if (!posDb) writesBlocked = true;
  if (!result.ok) return { ok: false, error: result.error };
  // stop the old screen from writing its (older) state over the restored data, then reload it
  pausedForReload = true;
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
  }, 400);
  return { ok: true, safetyCopy: result.safetyCopy };
});

// --- Daily local backup -----------------------------------------------------
// One copy per day in <userData>/backups (SQLite snapshot, or pos-data.json in
// fallback mode); keeps the newest BACKUP_KEEP of each. Runs at startup and
// before the first save of each new day. Never throws: a backup problem must
// not stop sales.
const BACKUP_KEEP = 14;
let lastBackupDay = null;
function backupDir() {
  return path.join(app.getPath("userData"), "backups");
}
function pruneBackups(pattern) {
  const files = fs
    .readdirSync(backupDir())
    .filter((f) => pattern.test(f))
    .sort();
  while (files.length > BACKUP_KEEP) fs.unlinkSync(path.join(backupDir(), files.shift()));
}
function dailyBackup() {
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (lastBackupDay === day) return;
    lastBackupDay = day;
    fs.mkdirSync(backupDir(), { recursive: true });
    if (posDb) {
      const target = path.join(backupDir(), `pos-${day}.db`);
      if (!fs.existsSync(target)) posDb.backupTo(target);
      pruneBackups(/^pos-\d{4}-\d{2}-\d{2}\.db$/);
    } else if (fs.existsSync(dataPath())) {
      const target = path.join(backupDir(), `pos-data-${day}.json`);
      if (!fs.existsSync(target)) fs.copyFileSync(dataPath(), target);
      pruneBackups(/^pos-data-\d{4}-\d{2}-\d{2}\.json$/);
    }
  } catch (err) {
    console.error("Daily backup failed:", err);
  }
}

function writeData(data) {
  dailyBackup(); // snapshot of the previous state, before today's first write
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
    height: 520,
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
        {
          label: "Test cash drawer",
          click: async () => {
            const r = await openDrawerFromConfig();
            dialog.showMessageBox(mainWindow, {
              type: r.ok ? "info" : "warning",
              message: r.ok ? "Drawer command sent." : "Could not open the cash drawer.",
              detail: r.ok ? "If the drawer did not open, try the other pin setting below." : r.error || "",
            });
          },
        },
        {
          label: "Cash drawer connector",
          submenu: [
            { label: "Pin 2 (most drawers)", type: "radio", checked: readConfig().drawerPin !== 1, click: () => writeConfig({ drawerPin: 0 }) },
            { label: "Pin 5", type: "radio", checked: readConfig().drawerPin === 1, click: () => writeConfig({ drawerPin: 1 }) },
          ],
        },
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
    initDatabase();
    dailyBackup();
    buildMenu();
    if (!isDev) {
      await startProductionServer();
      if (!serverProcess) return;
    }
    createWindow();
    updater = createUpdater({ app, getWindow: () => mainWindow, beforeInstall: preUpdateBackup });
  });

  app.on("window-all-closed", () => {
    if (serverProcess) serverProcess.kill();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    if (serverProcess) serverProcess.kill();
    if (posDb) {
      try {
        posDb.close();
      } catch {
        /* ignore */
      }
      posDb = null;
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// Only accept the fields the settings window is meant to change.
function sanitizeConfig(partial) {
  const out = {};
  if (partial && typeof partial.deviceName === "string") out.deviceName = partial.deviceName.slice(0, 256);
  if (partial && (partial.paperWidthMm === 58 || partial.paperWidthMm === 80)) out.paperWidthMm = partial.paperWidthMm;
  if (partial && (["escpos", "text", "driver"].includes(partial.printMode))) out.printMode = partial.printMode;
  return out;
}

ipcMain.handle("printers:get-config", () => readConfig());
ipcMain.handle("printers:set-config", (_evt, partial) => writeConfig(sanitizeConfig(partial)));
ipcMain.handle("printers:list", async () => {
  if (!mainWindow) return [];
  const printers = await mainWindow.webContents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault }));
});

// "Test print" button in the printer settings window. Uses the values currently
// selected in the form (even if not saved yet) so the shop can try before saving.
ipcMain.handle("printers:test-print", async (_evt, partial) => {
  const cfg = { ...readConfig(), ...sanitizeConfig(partial) };
  const testSale = {
    saleNo: "TEST",
    date: new Date().toISOString(),
    method: "Cash",
    currency: "Rs",
    shop: { name: "Printer test", address: "If you can read this, printing works" },
    items: [
      { name: "Test item A", qty: 1, unitPrice: 15000, price: 15000, lineTotal: 15000 },
      { name: "Test item B", qty: 2, unitPrice: 5050, price: 5050, lineTotal: 10100 },
    ],
    subtotal: 25100,
    tax: 0,
    total: 25100,
    tendered: 30000,
    productDiscount: 0,
    billDiscount: 0,
  };
  return printSale(testSale, cfg);
});

ipcMain.handle("data:load", () => {
  if (!posDb) return readData();
  try {
    pausedForReload = false;
    return posDb.loadState();
  } catch (err) {
    // Do not let the app start from blank data and overwrite a database it
    // merely failed to read.
    console.error("Database read failed:", err);
    writesBlocked = true;
    dialog.showErrorBox(
      "Database error",
      "The POS database could not be read, so saving is switched off to protect your data.\n\n" +
        "Close the app and contact support. Your daily backups are in:\n" +
        backupDir(),
    );
    return null;
  }
});

// Full state (first save, restore/import, or when delta saving isn't available)
ipcMain.handle("data:save", (_evt, data) => {
  if (writesBlocked || pausedForReload) return false;
  if (!posDb) return writeData(data);
  dailyBackup();
  return posDb.replaceAll(data);
});

// Only the rows that changed since the last save
ipcMain.handle("data:save-delta", (_evt, delta) => {
  if (!posDb) return { ok: false, fallback: true };
  if (writesBlocked || pausedForReload) return { ok: false, blocked: true };
  try {
    dailyBackup();
    posDb.applyDelta(delta);
    return { ok: true };
  } catch (err) {
    console.error("Delta save failed:", err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

// Receipt window: hidden, normal (non-offscreen) rendering. `offscreen: true`
// made some Windows printer drivers skip or crash the print job.
function createReceiptWindow(widthMM) {
  // Window width follows the roll width so layout (and measured height) match
  // what is printed. 96 CSS px per inch.
  const widthPx = Math.ceil(((widthMM || 80) / 25.4) * 96);
  return new BrowserWindow({
    show: false,
    width: widthPx,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
}

// Content height in microns, so the page is exactly as long as the receipt
// (a fixed A4-tall page would feed ~30cm of blank paper per bill).
async function measureReceiptHeightMicrons(win) {
  const px = await win.webContents.executeJavaScript(
    `Promise.all(Array.from(document.images).map(i => i.decode ? i.decode().catch(() => {}) : null))
       .then(() => Math.ceil(document.documentElement.scrollHeight))`,
  );
  const mm = ((Number(px) || 0) / 96) * 25.4;
  // Chromium rejects tiny custom pages; keep a floor and round up to whole mm.
  return Math.max(60, Math.ceil(mm) + 2) * 1000;
}

// Returns the Windows printer name to use, or an error if the saved printer
// is no longer installed (renamed, driver removed, ...). An empty deviceName
// means "system default printer".
async function resolvePrinter(win, deviceName) {
  let printers = [];
  try {
    printers = await win.webContents.getPrintersAsync();
  } catch {
    /* fall through: let print() decide */
    return { ok: true, deviceName: deviceName || undefined };
  }
  if (!deviceName) return { ok: true, deviceName: undefined };
  if (printers.some((p) => p.name === deviceName)) return { ok: true, deviceName };
  return { ok: false, error: `Printer "${deviceName}" was not found. Check Printer > Select receipt printer…` };
}

// ESC/POS image mode (default on Windows): the receipt is rendered, turned into
// a 1-bit raster and sent straight to the print queue as RAW data. This avoids
// Chromium's own print path, which makes some thermal drivers (e.g. Xprinter
// XP-80) spit out pages of garbage characters.
async function printSaleEscPos(sale, cfg) {
  const { buildReceiptHtml } = require("./receipt-template.cjs");
  const escpos = require("./escpos.cjs");
  const paper = cfg.paperWidthMm === 58 ? 58 : 80;
  const dots = escpos.dotsForPaper(paper);
  const cssWidth = (escpos.printableMm(paper) / 25.4) * 96;
  const zoom = dots / cssWidth; // render large so text is sharp at 203 dpi

  // offscreen rendering is what makes capturePage reliable for a hidden window
  const win = new BrowserWindow({
    show: false,
    width: dots,
    height: 800,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    const printerName = await resolveEscPosPrinter(win, cfg.deviceName);
    if (!printerName.ok) return { ok: false, error: printerName.error, fatal: true };

    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(buildReceiptHtml(sale, escpos.printableMm(paper))));
    win.webContents.setZoomFactor(zoom);
    const cssHeight = await win.webContents.executeJavaScript(
      `Promise.all(Array.from(document.images).map(i => i.decode ? i.decode().catch(() => {}) : null))
         .then(() => Math.ceil(document.documentElement.scrollHeight))`,
    );
    win.setContentSize(dots, Math.min(12000, Math.max(100, Math.ceil(cssHeight * zoom) + 8)));
    await new Promise((r) => setTimeout(r, 400)); // let the resized page paint

    let img = await win.webContents.capturePage();
    if (img.isEmpty()) return { ok: false, error: "Could not render the receipt" };
    if (img.getSize().width !== dots) img = img.resize({ width: dots, quality: "best" }); // display scaling
    const { width, height } = img.getSize();
    const { mono, bytesPerRow } = escpos.bgraToMono(img.toBitmap(), width, height);
    const trimmed = escpos.trimBottom(mono, bytesPerRow, height);
    if (trimmed.height === 0) return { ok: false, error: "Receipt rendered blank" };

    const job = escpos.buildRasterJob(trimmed.mono, bytesPerRow, trimmed.height);
    return await drawer.sendRaw({ printerName: printerName.deviceName, data: job, scriptDir: app.getPath("userData") });
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

// RAW printing needs a real queue name, so "system default" is resolved here.
async function resolveEscPosPrinter(win, deviceName) {
  let printers = [];
  try {
    printers = await win.webContents.getPrintersAsync();
  } catch {
    /* handled below */
  }
  if (deviceName) {
    if (printers.length && !printers.some((p) => p.name === deviceName)) {
      return { ok: false, error: `Printer "${deviceName}" was not found. Check Printer > Select receipt printer…` };
    }
    return { ok: true, deviceName };
  }
  const def = printers.find((p) => p.isDefault) || printers[0];
  if (!def) return { ok: false, error: "No printer found. Choose one under Printer > Select receipt printer…" };
  return { ok: true, deviceName: def.name };
}

// ESC/POS text mode: no rendering at all, plain 48/32-column receipt. English
// only (Sinhala shows as "?"), but works even if image rendering ever fails.
async function printSaleEscPosText(sale, cfg) {
  try {
    const escpos = require("./escpos.cjs");
    if (!mainWindow) return { ok: false, error: "No window" };
    const printer = await resolveEscPosPrinter(mainWindow, cfg.deviceName);
    if (!printer.ok) return { ok: false, error: printer.error, fatal: true };
    const job = escpos.buildTextJob(sale, cfg.paperWidthMm === 58 ? 58 : 80);
    return await drawer.sendRaw({ printerName: printer.deviceName, data: job, scriptDir: app.getPath("userData") });
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// printMode: "escpos" (image, default on Windows) | "text" | "driver".
// ESC/POS modes fall back to each other; they never fall back to "driver",
// because a driver that cannot take Chromium's output prints pages of junk.
// If everything fails the caller offers the manual print dialog.
async function printSale(sale, cfg) {
  const win32 = process.platform === "win32";
  const mode = cfg.printMode || (win32 ? "escpos" : "driver");
  const chain =
    !win32 || mode === "driver"
      ? [printSaleSilently]
      : mode === "text"
        ? [printSaleEscPosText, printSaleEscPos]
        : [printSaleEscPos, printSaleEscPosText];
  let last = { ok: false, error: "No print method available" };
  for (const method of chain) {
    last = await method(sale, cfg);
    if (last.ok || last.fatal) return last;
    console.error(`Print method ${method.name} failed:`, last.error);
  }
  return last;
}

async function printSaleSilently(sale, cfg) {
  const { buildReceiptHtml } = require("./receipt-template.cjs");
  const widthMM = cfg.paperWidthMm === 58 ? 58 : 80;
  const receiptWin = createReceiptWindow(widthMM);
  try {
    const printer = await resolvePrinter(receiptWin, cfg.deviceName);
    if (!printer.ok) return { ok: false, error: printer.error };

    await receiptWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(buildReceiptHtml(sale, widthMM)));
    const height = await measureReceiptHeightMicrons(receiptWin);

    return await new Promise((resolve) => {
      receiptWin.webContents.print(
        {
          silent: true,
          deviceName: printer.deviceName,
          margins: { marginType: "none" },
          printBackground: true,
          pageSize: { width: widthMM * 1000, height },
        },
        (success, errorType) => resolve({ ok: success, error: success ? undefined : errorType || "print-failed" }),
      );
    });
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    if (!receiptWin.isDestroyed()) receiptWin.destroy();
  }
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

// Cash drawer: kick pulse through the configured receipt printer (see drawer.cjs)
async function openDrawerFromConfig() {
  if (process.platform !== "win32") return { ok: false, error: "The cash drawer is supported on Windows only" };
  const cfg = readConfig();
  let name = cfg.deviceName;
  if (!name && mainWindow) {
    try {
      const list = await mainWindow.webContents.getPrintersAsync();
      name = (list.find((p) => p.isDefault) || list[0] || {}).name;
    } catch {
      /* no printer list */
    }
  }
  if (!name) return { ok: false, error: "No receipt printer selected (Printer menu > Select receipt printer…)" };
  return drawer.openDrawer({ printerName: name, pin: cfg.drawerPin === 1 ? 1 : 0, scriptDir: app.getPath("userData") });
}
ipcMain.handle("drawer:open", () => openDrawerFromConfig());

ipcMain.handle("print:receipt", async (_evt, sale) => {
  if (!mainWindow) return { ok: false, error: "No window" };
  const cfg = readConfig();
  const driverMode = process.platform !== "win32" || cfg.printMode === "driver";
  let result = await printSale(sale, cfg);
  if (!result.ok) {
    // ESC/POS modes: the manual Windows print dialog would send the bill through
    // Chromium's print path, which is the one that can print garbage on thermal
    // printers, so only offer a retry. Driver mode keeps the manual dialog.
    const buttons = driverMode ? ["Open print dialog", "Cancel"] : ["Try again", "Cancel"];
    const fallback = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons,
      defaultId: 0,
      message: "Couldn't print the receipt.",
      detail: `${result.error ? result.error + "\n\n" : ""}Check that the printer is on, has paper and is connected, or choose it under Printer > Select receipt printer…`,
    });
    if (fallback.response === 0) {
      if (driverMode) return printSaleWithDialog(sale, cfg);
      result = await printSale(sale, cfg);
    }
  }
  return result;
});
