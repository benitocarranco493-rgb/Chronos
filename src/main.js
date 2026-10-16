const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function steamRoots() {
  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Steam')]
    : [path.join(home, '.steam/steam'), path.join(home, '.local/share/Steam'), path.join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam')];
  return candidates.filter((p, i) => fs.existsSync(p) && candidates.indexOf(p) === i);
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
  return games;
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
  if (/^(steam|epic|com\.heroicgameslauncher\.|lutris):\/\//i.test(target)) return shell.openExternal(target).then(() => true);
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
