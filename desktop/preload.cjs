const { contextBridge, ipcRenderer } = require('electron');

// Expose named actions only; never expose Node, raw IPC, file paths or credentials.
contextBridge.exposeInMainWorld('jytodoDesktop', Object.freeze({
  platform: process.platform,
  settings: () => ipcRenderer.invoke('desktop:settings'),
  setAutoLaunch: enabled => ipcRenderer.invoke('desktop:auto-launch', enabled),
  openDataFolder: () => ipcRenderer.invoke('desktop:open-data-folder'),
  testNotification: () => ipcRenderer.invoke('desktop:test-notification'),
}));
