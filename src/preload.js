const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  detect: () => ipcRenderer.invoke("detect"),
  getCatalog: () => ipcRenderer.invoke("catalog"),
  version: () => ipcRenderer.invoke("version"),
});
