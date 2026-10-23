const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posHardware", {
  printReceipt: (sale) => ipcRenderer.invoke("print:receipt", sale),
  openDrawer: () => ipcRenderer.invoke("drawer:open"),
});

contextBridge.exposeInMainWorld("electronPrinting", {
  print: (sale) => ipcRenderer.invoke("print:receipt", sale),
  listPrinters: () => ipcRenderer.invoke("printers:list"),
  getConfig: () => ipcRenderer.invoke("printers:get-config"),
  setConfig: (partial) => ipcRenderer.invoke("printers:set-config", partial),
});

contextBridge.exposeInMainWorld("posData", {
  isElectron: true,
  load: () => ipcRenderer.invoke("data:load"),
  save: (data) => ipcRenderer.invoke("data:save", data),
  saveDelta: (delta) => ipcRenderer.invoke("data:save-delta", delta),
});

contextBridge.exposeInMainWorld("posUpdater", {
  getState: () => ipcRenderer.invoke("updater:get-state"),
  check: () => ipcRenderer.invoke("updater:check"),
  download: () => ipcRenderer.invoke("updater:download"),
  install: () => ipcRenderer.invoke("updater:install"),
  onState: (cb) => {
    const handler = (_evt, state) => cb(state);
    ipcRenderer.on("updater:state", handler);
    return () => ipcRenderer.removeListener("updater:state", handler);
  },
});

contextBridge.exposeInMainWorld("posBackups", {
  list: () => ipcRenderer.invoke("backups:list"),
  inspect: (name) => ipcRenderer.invoke("backups:inspect", name),
  create: () => ipcRenderer.invoke("backups:create"),
  restore: (name, actor) => ipcRenderer.invoke("backups:restore", name, actor),
  openFolder: () => ipcRenderer.invoke("backups:open-folder"),
});
