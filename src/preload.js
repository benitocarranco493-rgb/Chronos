const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chronos', {
  scanGames: () => ipcRenderer.invoke('games:scan'),
  launch: target => ipcRenderer.invoke('game:launch', target),
  openStore: url => ipcRenderer.invoke('store:open', url),
  pickGame: () => ipcRenderer.invoke('game:pick')
});
