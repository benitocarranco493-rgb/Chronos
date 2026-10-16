const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createStore } = require('./data/store');
const { createCredentialStore } = require('./data/credentials');
const { scanInstalledGames } = require('./providers/library');
const { searchStores } = require('./providers/stores');
const { importSteamLibrary, searchGridArt } = require('./providers/online');

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
ipcMain.handle('store:search', (_event, query, region) => {
  const country = typeof region?.country === 'string' && /^[A-Za-z]{2}$/.test(region.country) ? region.country.toUpperCase() : 'ES';
  const locale = typeof region?.locale === 'string' && /^[a-z]{2}-[A-Z]{2}$/.test(region.locale) ? region.locale : 'es-ES';
  return searchStores(query, { country, locale });
});
ipcMain.handle('steam:library', async (_event, steamId) => importSteamLibrary(await credentials.get('steam'), steamId));
ipcMain.handle('art:search', async (_event, title) => searchGridArt(await credentials.get('steamgriddb'), title));
ipcMain.handle('art:download', async (_event, imageUrl) => {
  let url;
  try { url = new URL(imageUrl); } catch { throw new Error('Invalid artwork URL.'); }
  if (url.protocol !== 'https:' || !/^cdn\d*\.steamgriddb\.com$/i.test(url.hostname)) throw new Error('Only SteamGridDB artwork can be downloaded.');
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.startsWith('image/')) throw new Error('Could not download this artwork.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Artwork must be smaller than 8 MB.');
  const extension = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
  const directory = path.join(app.getPath('userData'), 'artwork');
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, `${crypto.randomUUID()}${extension}`);
  fs.writeFileSync(filePath, bytes);
  return pathToFileURL(filePath).href;
});
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
