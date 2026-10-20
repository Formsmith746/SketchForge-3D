const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sketchforgeDesktop", {
  getVersion: () => ipcRenderer.invoke("sketchforge:get-version"),
  checkForUpdates: () => ipcRenderer.invoke("sketchforge:check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("sketchforge:install-update"),
});
