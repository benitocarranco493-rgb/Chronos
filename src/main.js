const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { createStore } = require('./data/store');
const { createCredentialStore } = require('./data/credentials');
const { DiscordPresence } = require('./providers/discord');
const { scanInstalledGamesDetailed, findRiotClient, findBattleNetClient } = require('./providers/library');
const { createGameLauncher } = require('./providers/launch');
const { searchStores, browseStores, validateEpicBrowseUrl } = require('./providers/stores');
const { importSteamLibrary, getSteamGameDetails, getSteamGameGenres, getSteamStoreDetails, getSteamGameDlc, searchGridArt } = require('./providers/online');
const { epicLoginUrl, connectEpic, epicLibrary } = require('./providers/epic');
const { autoUpdater } = require('electron-updater');

const launchGame = createGameLauncher({
  platform: process.platform,
  shell,
  findRiotClient,
  findBattleNetClient,
  execFile: require('node:child_process').execFile
});

const store = createStore(app.getPath('userData'));
const credentials = createCredentialStore(app.getPath('userData'), safeStorage, process.platform);
const discordPresence = new DiscordPresence();
autoUpdater.autoDownload = false;
let availableUpdate = false;
let activeTrackedGames = 0;
const notifyUpdate = payload => BrowserWindow.getAllWindows().forEach(win => win.webContents.send('update:state', payload));
autoUpdater.on('update-available', info => { availableUpdate = true; notifyUpdate({ state: 'available', version: info.version }); });
autoUpdater.on('update-not-available', info => notifyUpdate({ state: 'current', version: info.version }));
autoUpdater.on('download-progress', progress => notifyUpdate({ state: 'downloading', percent: Math.round(progress.percent) }));
autoUpdater.on('update-downloaded', info => notifyUpdate({ state: 'downloaded', version: info.version }));
autoUpdater.on('error', error => notifyUpdate({ state: 'error', message: error.message }));

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 960, minWidth: 960, minHeight: 680,
    backgroundColor: '#11130f', title: 'Chronos',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (url !== win.webContents.getURL()) event.preventDefault(); });
  win.loadFile(path.join(__dirname, 'index.html'));
}

let libraryWatchers = [];
let libraryChangeTimer = null;
function watchLocalLibraries() {
  for (const watcher of libraryWatchers) watcher.close();
  libraryWatchers = [];
  if (process.platform !== 'win32') return;
  const paths = new Map();
  const add = (folder, provider) => { try { if (folder && fs.statSync(folder).isDirectory()) paths.set(folder, provider); } catch {} };
  const roots = [...new Set([process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean).map(root => path.join(root, 'Steam')))];
  for (const root of roots) {
    add(path.join(root, 'steamapps'), 'Steam');
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
    try { for (const match of fs.readFileSync(vdf, 'utf8').matchAll(/"path"\s+"((?:\\\\.|[^"])*)"/g)) add(path.join(match[1].replace(/\\\\/g, '\\'), 'steamapps'), 'Steam'); } catch {}
    add(path.join(root, 'config'), 'Steam');
  }
  add(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'), 'Epic Games');
  for (const folder of [path.join(process.env.APPDATA || '', 'heroic'), path.join(process.env.LOCALAPPDATA || '', 'Heroic'), path.join(process.env.LOCALAPPDATA || '', 'Lutris')]) add(folder, 'Other launchers');
  for (const [folder, provider] of paths) {
    try { libraryWatchers.push(fs.watch(folder, { persistent: false }, () => { clearTimeout(libraryChangeTimer); libraryChangeTimer = setTimeout(() => { watchLocalLibraries(); BrowserWindow.getAllWindows().forEach(win => win.webContents.send('library:changed', { provider })); }, 900); })); } catch {}
  }
}

app.whenReady().then(() => {
  watchLocalLibraries();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !(process.platform === 'win32' && activeTrackedGames > 0)) app.quit(); });
app.on('before-quit', () => discordPresence.close());

ipcMain.handle('data:load', async (_event, legacy = {}) => {
  const legacySettings = legacy.settings && typeof legacy.settings === 'object' ? legacy.settings : {};
  const hasLegacyKeys = Boolean(legacySettings['steam-key'] || legacySettings['sgdb-key']);
  const credentialsMigrated = hasLegacyKeys ? await credentials.migrateLegacy(legacySettings) : true;
  const database = store.load({ ...legacy, settings: {} });
  return { ...database, credentials: await credentials.status(), credentialsMigrated };
});
ipcMain.handle('data:save', (_event, database) => {
  if (!database || typeof database !== 'object' || !Array.isArray(database.games) || database.games.length > 10000) throw new Error('Invalid library data.');
  return store.save(database);
});
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch, electron: process.versions.electron, os: os.release() }));
ipcMain.handle('discord:connect', async (_event, options = {}) => {
  if (options.enabled !== true) { discordPresence.close(); return { connected: false, message: 'Discord presence is off.' }; }
  if (typeof options.applicationId !== 'string') throw new Error('Enter your Discord Application ID.');
  await discordPresence.connect(options.applicationId);
  return { connected: true, message: 'Connected to the local Discord desktop app.' };
});
ipcMain.handle('discord:activity', (_event, title) => {
  if (typeof title !== 'string' || title.length > 256) return false;
  return discordPresence.setActivity(title);
});
ipcMain.handle('discord:clear', () => discordPresence.setActivity(null));
ipcMain.handle('credentials:set', (_event, provider, value) => {
  if (!['steam', 'steamgriddb'].includes(provider) || typeof value !== 'string' || value.length > 512) return false;
  return credentials.set(provider, value);
});
ipcMain.handle('credentials:status', () => credentials.status());
ipcMain.handle('games:scan', () => scanInstalledGamesDetailed());
ipcMain.handle('epic:login-url', () => epicLoginUrl());
ipcMain.handle('epic:connect', async (_event, code) => {
  const session = await connectEpic(code);
  if (!await credentials.set('epic', JSON.stringify(session))) throw new Error('Chronos could not store the Epic session securely. Check the OS keyring.');
  if (!await credentials.get('epic')) {
    await credentials.set('epic', '');
    throw new Error('Epic sign-in succeeded, but Chronos could not read the saved session. Check Windows secure storage and connect again.');
  }
  return true;
});
ipcMain.handle('epic:library', async () => {
  const rawSession = await credentials.get('epic');
  if (!rawSession) throw new Error('No Epic session is saved. In Settings, sign in with Epic, paste its authorization code, and press Connect first.');
  let session;
  try { session = rawSession ? JSON.parse(rawSession) : null; } catch { session = null; }
  return epicLibrary(session, async refreshed => {
    if (!await credentials.set('epic', JSON.stringify(refreshed))) throw new Error('Chronos could not refresh the Epic session securely.');
  });
});
ipcMain.handle('epic:disconnect', () => credentials.set('epic', ''));
ipcMain.handle('store:search', (_event, query, region) => {
  const country = typeof region?.country === 'string' && /^[A-Za-z]{2}$/.test(region.country) ? region.country.toUpperCase() : 'ES';
  const locale = typeof region?.locale === 'string' && /^[a-z]{2}-[A-Z]{2}$/.test(region.locale) ? region.locale : 'es-ES';
  const start = Number.isInteger(region?.start) ? Math.max(0, Math.min(240, region.start)) : 0;
  return searchStores(query, { country, locale, start });
});
ipcMain.handle('store:browse', (_event, region) => {
  const country = typeof region?.country === 'string' && /^[A-Za-z]{2}$/.test(region.country) ? region.country.toUpperCase() : 'ES';
  const locale = typeof region?.locale === 'string' && /^[a-z]{2}-[A-Z]{2}$/.test(region.locale) ? region.locale : 'es-ES';
  return browseStores({ country, locale });
});
ipcMain.handle('steam:library', async (_event, steamId) => importSteamLibrary(await credentials.get('steam'), steamId));
const steamGenresCache = new Map();
ipcMain.handle('steam:genres', async (_event, appIds) => {
  if (!Array.isArray(appIds) || appIds.length > 500 || appIds.some(id => typeof id !== 'string' || !/^\d{1,10}$/.test(id))) throw new Error('Invalid Steam genre request.');
  const result = {};
  const ids = [...new Set(appIds)];
  for (let index = 0; index < ids.length; index += 5) {
    await Promise.all(ids.slice(index, index + 5).map(async id => {
      const cached = steamGenresCache.get(id);
      if (cached && cached.expiresAt > Date.now()) { result[id] = { genres: cached.genres, fetchedAt: cached.fetchedAt }; return; }
      try {
        const genres = await getSteamGameGenres(id);
        const fetchedAt = Date.now();
        steamGenresCache.set(id, { genres, fetchedAt, expiresAt: fetchedAt + 30 * 24 * 60 * 60 * 1000 });
        result[id] = { genres, fetchedAt };
      } catch (error) { result[id] = { error: error.message }; }
    }));
  }
  return result;
});
const steamStoreDetailsCache = new Map();
ipcMain.handle('steam:store-details', async (_event, appId) => {
  if (typeof appId !== 'string' || !/^\d{1,10}$/.test(appId)) throw new Error('Invalid Steam game details request.');
  const cached = steamStoreDetailsCache.get(appId);
  if (cached && cached.expiresAt > Date.now()) return cached.details;
  const details = await getSteamStoreDetails(appId);
  steamStoreDetailsCache.set(appId, { details, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return details;
});
const steamDetailsCache = new Map();
ipcMain.handle('steam:game-details', async (_event, appId, steamProfile) => {
  if (typeof appId !== 'string' || !/^\d{1,10}$/.test(appId) || typeof steamProfile !== 'string' || steamProfile.length > 200) throw new Error('Invalid Steam game details request.');
  const cacheKey = `${steamProfile}:${appId}`;
  const cached = steamDetailsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.details;
  const details = await getSteamGameDetails(await credentials.get('steam'), steamProfile, appId);
  steamDetailsCache.set(cacheKey, { details, expiresAt: Date.now() + 10 * 60 * 1000 });
  return details;
});
const steamDlcCache = new Map();
ipcMain.handle('steam:game-dlc', async (_event, appId) => {
  if (typeof appId !== 'string' || !/^\d{1,10}$/.test(appId)) throw new Error('Invalid Steam game ID.');
  const cached = steamDlcCache.get(appId);
  if (cached && cached.expiresAt > Date.now()) return cached.dlcs;
  const dlcs = await getSteamGameDlc(appId);
  steamDlcCache.set(appId, { dlcs, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
  return dlcs;
});
ipcMain.handle('art:search', async (_event, title) => searchGridArt(await credentials.get('steamgriddb'), title));
ipcMain.handle('art:download', async (_event, imageUrl) => {
  let url;
  try { url = new URL(imageUrl); } catch { throw new Error('Invalid artwork URL.'); }
  if (url.protocol !== 'https:' || !/^cdn\d*\.steamgriddb\.com$/i.test(url.hostname)) throw new Error('Only SteamGridDB artwork can be downloaded.');
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type.split(';')[0].trim().toLowerCase())) throw new Error('Could not download this artwork.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Artwork must be smaller than 8 MB.');
  const extension = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
  const directory = path.join(app.getPath('userData'), 'artwork');
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, `${crypto.randomUUID()}${extension}`);
  fs.writeFileSync(filePath, bytes);
  return pathToFileURL(filePath).href;
});
ipcMain.handle('game:launch', async (_event, gameId, target) => {
  if (typeof gameId !== 'string' || typeof target !== 'string' || target.length > 2048) return { launched: false, tracked: false };
  if (process.platform !== 'win32' || !/\.exe$/i.test(target) || !fs.existsSync(target)) return { launched: await launchGame(target), tracked: false };
  const database = store.load();
  if (!database.games.some(game => game.id === gameId)) return { launched: false, tracked: false };
  const startedAt = Date.now();
  let child;
  try { child = spawn(target, [], { windowsHide: true, stdio: 'ignore' }); }
  catch { return { launched: false, tracked: false }; }
  let spawned = false;
  let finalized = false;
  const finish = () => {
    if (finalized || !spawned) return;
    finalized = true;
    activeTrackedGames = Math.max(0, activeTrackedGames - 1);
    if (activeTrackedGames === 0) discordPresence.setActivity(null);
    const endedAt = Date.now(), durationSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
    try {
      const latest = store.load(), game = latest.games.find(item => item.id === gameId);
      if (!game) return;
      const session = { startedAt, endedAt, durationSeconds };
      game.sessions = [...(game.sessions || []), session].slice(-100);
      game.localPlaytimeMinutes = (game.localPlaytimeMinutes || 0) + durationSeconds / 60;
      game.lastPlayed = endedAt;
      store.save(latest);
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('game:session-ended', { gameId, session, localPlaytimeMinutes: game.localPlaytimeMinutes, lastPlayed: endedAt }));
    } catch (error) { console.error('Could not save the game session:', error); }
  };
  const launched = await new Promise(resolve => {
    child.once('spawn', () => { spawned = true; activeTrackedGames += 1; resolve(true); });
    child.once('error', () => resolve(false));
    child.once('close', finish);
  });
  if (!launched) return { launched: false, tracked: false };
  child.once('error', finish);
  return { launched: true, tracked: true };
});
ipcMain.handle('store:open', (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
  return shell.openExternal(url);
});
ipcMain.handle('store:epic-browse', async (_event, value) => {
  const target = validateEpicBrowseUrl(value);
  const isEpicUrl = candidate => {
    try {
      const url = new URL(candidate);
      return url.protocol === 'https:' && (url.hostname === 'epicgames.com' || url.hostname.endsWith('.epicgames.com'));
    } catch { return false; }
  };
  const browser = new BrowserWindow({
    width: 1280, height: 850, minWidth: 800, minHeight: 600,
    title: 'Epic Games Store · Chronos', backgroundColor: '#11130f',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  browser.webContents.setWindowOpenHandler(({ url }) => {
    if (isEpicUrl(url)) void browser.loadURL(url).catch(() => browser.close());
    else if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  browser.webContents.on('will-redirect', (event, url) => {
    if (!isEpicUrl(url)) event.preventDefault();
  });
  browser.webContents.on('will-navigate', (event, url) => {
    if (isEpicUrl(url)) return;
    event.preventDefault();
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
  });
  await browser.loadURL(target);
  return true;
});
ipcMain.handle('update:check', async () => {
  if (app.isPackaged) {
    try {
      const result = await autoUpdater.checkForUpdates();
      availableUpdate = Boolean(result?.updateInfo && result.updateInfo.version !== app.getVersion());
      return { packaged: true, current: app.getVersion(), available: availableUpdate, version: result?.updateInfo?.version || app.getVersion() };
    } catch (error) { throw new Error(`Could not check for updates: ${error.message}`); }
  }
  const response = await fetch('https://api.github.com/repos/benitocarranco493-rgb/Chronos/releases/latest', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Chronos-Launcher' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
  const release = await response.json();
  const latest = String(release.tag_name || '').replace(/^v/, '');
  const current = app.getVersion();
  return { packaged: false, current, available: Boolean(latest && latest.localeCompare(current, undefined, { numeric: true, sensitivity: 'base' }) > 0), version: latest, url: release.html_url };
});
ipcMain.handle('update:download', async () => {
  if (!app.isPackaged || !availableUpdate) throw new Error('No packaged update is available.');
  await autoUpdater.downloadUpdate();
  return true;
});
ipcMain.handle('update:install', () => { if (!app.isPackaged) return false; autoUpdater.quitAndInstall(); return true; });
ipcMain.handle('update:open', (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\/github\.com\/benitocarranco493-rgb\/Chronos\/releases\//i.test(url)) return false;
  return shell.openExternal(url);
});
ipcMain.handle('game:pick', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Choose a game or launcher' });
  return result.canceled ? null : result.filePaths[0];
});
