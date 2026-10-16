const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron');
const path = require('node:path');
const { createStore } = require('./data/store');
const { createCredentialStore } = require('./data/credentials');
const { scanInstalledGames } = require('./providers/library');

const store = createStore(app.getPath('userData'));
const credentials = createCredentialStore(app.getPath('userData'), safeStorage, process.platform);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 960, minWidth: 960, minHeight: 680,
    backgroundColor: '#11130f', title: 'Chronos',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('data:load', async (_event, legacy = {}) => {
  const legacySettings = legacy.settings && typeof legacy.settings === 'object' ? legacy.settings : {};
  const hasLegacyKeys = Boolean(legacySettings['steam-key'] || legacySettings['sgdb-key']);
  const credentialsMigrated = hasLegacyKeys ? await credentials.migrateLegacy(legacySettings) : true;
  const database = store.load({ ...legacy, settings: {} });
  return { ...database, credentials: await credentials.status(), credentialsMigrated };
});
ipcMain.handle('data:save', (_event, database) => store.save(database));
ipcMain.handle('credentials:set', (_event, provider, value) => credentials.set(provider, value));
ipcMain.handle('credentials:status', () => credentials.status());
ipcMain.handle('games:scan', () => scanInstalledGames());
ipcMain.handle('game:launch', async (_event, target) => {
  if (typeof target !== 'string' || !target) return false;
  if (/^https?:\/\//i.test(target) || /^(steam|epic|heroic|com\.heroicgameslauncher\.|lutris):\/\//i.test(target) || /^lutris:rungame\//i.test(target)) {
    try { await shell.openExternal(target); return true; } catch { return false; }
  }
  if (process.platform === 'win32') return shell.openPath(target).then(error => !error);
  const { execFile } = require('node:child_process');
  return new Promise(resolve => {
    const parts = target.match(/(?:"([^"]*)"|'([^']*)'|\S+)/g) || [];
    const bin = (parts.shift() || '').replace(/^(?:"|')|(?:"|')$/g, '');
    const args = parts.map(part => part.replace(/^(?:"|')|(?:"|')$/g, ''));
    execFile(bin, args, error => resolve(!error));
  });
});
ipcMain.handle('store:open', (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
  return shell.openExternal(url);
});
ipcMain.handle('game:pick', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Choose a game or launcher' });
  return result.canceled ? null : result.filePaths[0];
});
