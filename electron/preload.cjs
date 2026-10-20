const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posHardware", {
  printReceipt: (sale) => ipcRenderer.invoke("print:receipt", sale),
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
});

contextBridge.exposeInMainWorld("posLicense", {
  isElectron: true,
  get: () => ipcRenderer.invoke("license:get"),
  activate: (code) => ipcRenderer.invoke("license:activate", code),
});
