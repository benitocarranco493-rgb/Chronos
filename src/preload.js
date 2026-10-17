const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chronos', {
  loadData: legacy => ipcRenderer.invoke('data:load', legacy),
  saveData: database => ipcRenderer.invoke('data:save', database),
  saveCredential: (provider, value) => ipcRenderer.invoke('credentials:set', provider, value),
  scanGames: () => ipcRenderer.invoke('games:scan'),
  searchStores: (query, region) => ipcRenderer.invoke('store:search', query, region),
  importSteamLibrary: steamId => ipcRenderer.invoke('steam:library', steamId),
  loadSteamGameDetails: (appId, steamProfile) => ipcRenderer.invoke('steam:game-details', appId, steamProfile),
  searchArtwork: title => ipcRenderer.invoke('art:search', title),
  downloadArtwork: imageUrl => ipcRenderer.invoke('art:download', imageUrl),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openUpdatePage: url => ipcRenderer.invoke('update:open', url),
  onUpdateState: callback => ipcRenderer.on('update:state', (_event, payload) => callback(payload)),
  launch: target => ipcRenderer.invoke('game:launch', target),
  openStore: url => ipcRenderer.invoke('store:open', url),
  openEpicBrowse: url => ipcRenderer.invoke('store:epic-browse', url),
  pickGame: () => ipcRenderer.invoke('game:pick')
});
