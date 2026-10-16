const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const readText = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };
const jsonFile = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

function steamRoots() {
  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Steam'), path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Steam'), path.join(process.env.LOCALAPPDATA || '', 'Steam')]
    : [path.join(home, '.steam/steam'), path.join(home, '.local/share/Steam'), path.join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam')];
  if (process.platform === 'win32') {
    for (const key of ['HKCU\\Software\\Valve\\Steam', 'HKLM\\Software\\WOW6432Node\\Valve\\Steam', 'HKLM\\Software\\Valve\\Steam']) try {
      const output = execFileSync('reg', ['query', key, '/v', 'SteamPath'], { encoding: 'utf8', timeout: 1200 });
      const value = output.match(/SteamPath\s+REG_SZ\s+(.+)$/mi)?.[1]?.trim();
      if (value) candidates.push(value.replace(/\\/g, path.sep));
    } catch { /* this registry location is not present */ }
  }
  return candidates.filter((p, i) => fs.existsSync(p) && candidates.indexOf(p) === i);
}

function steamGames() {
  const games = [];
  for (const root of steamRoots()) {
    const libraries = [root, ...[...readText(path.join(root, 'steamapps/libraryfolders.vdf')).matchAll(/"path"\s+"([^"]+)"/g)].map(m => m[1].replace(/\\\\/g, '\\'))];
    for (const library of new Set(libraries)) {
      const directory = path.join(library, 'steamapps');
      try {
        for (const file of fs.readdirSync(directory).filter(name => /^appmanifest_\d+\.acf$/i.test(name))) {
          const manifest = readText(path.join(directory, file));
          const title = manifest.match(/"name"\s+"([^"]+)"/i)?.[1];
          const id = file.match(/\d+/)?.[0];
          if (title && id) games.push({ id: `steam-${id}`, title, platform: 'Steam', source: 'steam', art: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`, launch: `steam://rungameid/${id}` });
        }
      } catch { /* a library can be offline or unreadable */ }
    }
  }
  return games;
}

function flatpakGames() {
  if (process.platform !== 'linux') return [];
  try {
    const output = execFileSync('flatpak', ['list', '--app', '--columns=application,name'], { encoding: 'utf8', timeout: 1500 });
    return output.trim().split(/\r?\n/).slice(1).flatMap(line => {
      const [id, ...label] = line.split('\t');
      return id ? [{ id: `flatpak-${id}`, title: label.join(' ') || id, platform: 'Flatpak', source: 'flatpak', launch: `flatpak run ${id}` }] : [];
    });
  } catch { return []; }
}

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
      const artwork = metadata?.metadata?.keyImages?.find(image => ['DieselGameBox', 'OfferImageWide', 'DieselGameBoxTall'].includes(image.type))?.url || '';
      games.push({ id: `heroic-${appName}`, title, platform: 'Heroic', source: 'heroic', art: artwork, launch: `heroic://launch?appName=${encodeURIComponent(appName)}&runner=legendary` });
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
    const databasePath = path.join(root, 'pga.db');
    let rows = null;
    if (fs.existsSync(databasePath)) {
      try {
        const { DatabaseSync } = require('node:sqlite');
        const database = new DatabaseSync(databasePath);
        try { rows = database.prepare('SELECT name, slug FROM games WHERE installed = 1').all(); }
        finally { database.close(); }
      } catch {
        try {
          const output = execFileSync('sqlite3', ['-json', databasePath, 'SELECT name, slug FROM games WHERE installed = 1'], { encoding: 'utf8', timeout: 1500 });
          rows = JSON.parse(output || '[]');
        } catch { /* try the game config files below */ }
      }
    }
    if (rows) {
      for (const game of rows) if (game.slug) games.push({ id: `lutris-${game.slug}`, title: game.name || game.slug, platform: 'Lutris', source: 'lutris', launch: `lutris:rungame/${game.slug}` });
    } else {
      const directories = new Set([path.join(root, 'games'), path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'lutris', 'games')]);
      for (const directory of directories) try {
        for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.yml'))) {
          const data = readText(path.join(directory, file));
          const title = data.match(/^\s*name:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
          const slug = file.replace(/\.yml$/i, '').replace(/-\d+$/, '');
          if (title && slug) games.push({ id: `lutris-${slug}`, title, platform: 'Lutris', source: 'lutris', launch: `lutris:rungame/${slug}` });
        }
      } catch { /* no Lutris config in this location */ }
    }
  }
  return games;
}

function scanInstalledGames() {
  const unique = new Map();
  for (const game of [...steamGames(), ...heroicGames(), ...lutrisGames(), ...flatpakGames()]) unique.set(game.id, game);
  return [...unique.values()];
}

module.exports = { scanInstalledGames };
