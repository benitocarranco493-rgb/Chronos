const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chronos', {
  loadData: legacy => ipcRenderer.invoke('data:load', legacy),
  saveData: database => ipcRenderer.invoke('data:save', database),
  saveCredential: (provider, value) => ipcRenderer.invoke('credentials:set', provider, value),
  scanGames: () => ipcRenderer.invoke('games:scan'),
  searchStores: (query, region) => ipcRenderer.invoke('store:search', query, region),
  importSteamLibrary: steamId => ipcRenderer.invoke('steam:library', steamId),
  searchArtwork: title => ipcRenderer.invoke('art:search', title),
  downloadArtwork: imageUrl => ipcRenderer.invoke('art:download', imageUrl),
  launch: target => ipcRenderer.invoke('game:launch', target),
  openStore: url => ipcRenderer.invoke('store:open', url),
  pickGame: () => ipcRenderer.invoke('game:pick')
});
