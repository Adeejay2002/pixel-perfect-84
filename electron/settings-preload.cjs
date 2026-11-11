const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("settingsAPI", {
  listPrinters: () => ipcRenderer.invoke("printers:list"),
  getConfig: () => ipcRenderer.invoke("printers:get-config"),
  setConfig: (partial) => ipcRenderer.invoke("printers:set-config", partial),
  testPrint: (partial) => ipcRenderer.invoke("printers:test-print", partial),
});
