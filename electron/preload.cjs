const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studyCards", {
  loadCards: () => ipcRenderer.invoke("cards:load"),
  saveCards: (database) => ipcRenderer.invoke("cards:save", database),
  getStorageInfo: () => ipcRenderer.invoke("cards:getStorageInfo"),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getDriveStatus: () => ipcRenderer.invoke("drive:status"),
  signInDrive: () => ipcRenderer.invoke("drive:signIn"),
  cancelSignInDrive: () => ipcRenderer.invoke("drive:cancelSignIn"),
  signOutDrive: () => ipcRenderer.invoke("drive:signOut"),
  syncDrive: () => ipcRenderer.invoke("drive:sync"),
  getUpdateStatus: () => ipcRenderer.invoke("updates:getStatus"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  }
});