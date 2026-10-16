const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function steamRoots() {
  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Steam'), path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Steam'), path.join(process.env.LOCALAPPDATA || '', 'Steam')]
    : [path.join(home, '.steam/steam'), path.join(home, '.local/share/Steam'), path.join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam')];
  return candidates.filter((p, i) => fs.existsSync(p) && candidates.indexOf(p) === i);
}
function jsonFile(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function heroicGames() {
  const home = os.homedir();
  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const roots = process.platform === 'win32'
    ? [path.join(home, '.config', 'legendary'), path.join(process.env.APPDATA || '', 'heroic', 'legendary')]
    : [path.join(configHome, 'legendary'), path.join(home, '.var/app/com.heroicgameslauncher.hgl/config/legendary')];
  const games = [];
  for (const root of roots) {
    const installed = jsonFile(path.join(root, 'installed.json'));
    if (!installed || typeof installed !== 'object') continue;
    for (const [appName, info] of Object.entries(installed)) {
      if (!info || typeof info !== 'object') continue;
      const metadata = jsonFile(path.join(root, 'metadata', `${appName}.json`));
      const title = metadata?.metadata?.title || metadata?.title || appName;
      games.push({ id: `heroic-${appName}`, title, platform: 'Heroic', art: metadata?.metadata?.keyImages?.find(x => ['DieselGameBox', 'OfferImageWide', 'DieselGameBoxTall'].includes(x.type))?.url || '', launch: `heroic://launch?appName=${encodeURIComponent(appName)}&runner=legendary` });
    }
  }
  return games;
}
function lutrisGames() {
  if (process.platform !== 'linux') return [];
  const home = os.homedir();
  const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local/share');
  const roots = [path.join(dataHome, 'lutris'), path.join(home, '.var/app/net.lutris.Lutris/data/lutris')];
  const games = [];
  for (const root of roots) {
    const db = path.join(root, 'pga.db');
    try {
      const result = require('node:child_process').execFileSync('sqlite3', ['-json', db, 'SELECT name, slug, installed FROM games WHERE installed = 1'], { encoding: 'utf8', timeout: 1500 });
      for (const row of JSON.parse(result || '[]')) if (row.slug) games.push({ id: `lutris-${row.slug}`, title: row.name || row.slug, platform: 'Lutris', launch: `lutris:rungame/${row.slug}` });
    } catch {
      // Lutris' database is authoritative. A config-file fallback covers installations
      // where the sqlite3 command line utility is not installed.
      const configDirs = [path.join(root, 'games'), path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'lutris', 'games')];
      for (const configDir of new Set(configDirs)) try {
        for (const file of fs.readdirSync(configDir).filter(name => name.endsWith('.yml'))) {
          const data = readText(path.join(configDir, file));
          const name = data.match(/^\s*name:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
          const slug = file.replace(/\.yml$/i, '').replace(/-\d+$/, '');
          if (name && slug) games.push({ id: `lutris-${slug}`, title: name, platform: 'Lutris', launch: `lutris:rungame/${slug}` });
        }
      } catch { /* Lutris is not installed here */ }
    }
  }
  return games;
}
function installedGames() {
  const games = [];
  for (const root of steamRoots()) {
    const libraryFile = path.join(root, 'steamapps/libraryfolders.vdf');
    const libraries = [root, ...[...readText(libraryFile).matchAll(/"path"\s+"([^"]+)"/g)].map(m => m[1].replace(/\\\\/g, '\\'))];
    for (const library of [...new Set(libraries)]) {
      const dir = path.join(library, 'steamapps');
      try { for (const file of fs.readdirSync(dir).filter(f => /^appmanifest_\d+\.acf$/i.test(f))) {
        const data = readText(path.join(dir, file));
        const name = data.match(/"name"\s+"([^"]+)"/i)?.[1];
        const id = file.match(/\d+/)?.[0];
        if (name && id) games.push({ id: `steam-${id}`, title: name, platform: 'Steam', art: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`, launch: `steam://rungameid/${id}` });
      }} catch { /* library not mounted */ }
    }
  }
  if (process.platform === 'linux') {
    try { const out = require('node:child_process').execFileSync('flatpak', ['list', '--app', '--columns=application,name'], { encoding: 'utf8', timeout: 1500 });
      for (const line of out.trim().split(/\r?\n/).slice(1)) { const [id, ...label] = line.split('\t'); if (id) games.push({ id: `flatpak-${id}`, title: label.join(' ') || id, platform: 'Flatpak', launch: `flatpak run ${id}` }); }
    } catch { /* flatpak is optional */ }
  }
  games.push(...heroicGames(), ...lutrisGames());
  return [...new Map(games.map(game => [game.id, game])).values()];
}

function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 960, minHeight: 680, backgroundColor: '#11130f', title: 'Chronos', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.handle('games:scan', () => installedGames());
ipcMain.handle('game:launch', async (_event, target) => {
  if (typeof target !== 'string' || !target) return false;
  if (/^https?:\/\//i.test(target)) return shell.openExternal(target).then(() => true);
  if (/^(steam|epic|heroic|com\.heroicgameslauncher\.|lutris):\/\//i.test(target)) return shell.openExternal(target).then(() => true);
  if (/^lutris:rungame\//i.test(target)) return shell.openExternal(target).then(() => true);
  if (process.platform === 'win32') return shell.openPath(target).then(error => !error);
  const { execFile } = require('node:child_process');
  return new Promise(resolve => {
    const parts = target.match(/(?:"([^"]*)"|'([^']*)'|\S+)/g) || [];
    const bin = (parts.shift() || '').replace(/^(?:"|')|(?:"|')$/g, '');
    const args = parts.map(part => part.replace(/^(?:"|')|(?:"|')$/g, ''));
    execFile(bin, args, error => resolve(!error));
  });
});
ipcMain.handle('store:open', (_event, url) => shell.openExternal(url));
ipcMain.handle('game:pick', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Choose a game or launcher' });
  return result.canceled ? null : result.filePaths[0];
});
