const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studyCards", {
  loadCards: () => ipcRenderer.invoke("cards:load"),
  saveCards: (database) => ipcRenderer.invoke("cards:save", database),
  getStorageInfo: () => ipcRenderer.invoke("cards:getStorageInfo"),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getDriveStatus: () => ipcRenderer.invoke("drive:status"),
  signInDrive: () => ipcRenderer.invoke("drive:signIn"),
  signOutDrive: () => ipcRenderer.invoke("drive:signOut"),
  syncDrive: () => ipcRenderer.invoke("drive:sync")
});
