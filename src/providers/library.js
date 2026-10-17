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
      const output = execFileSync('reg', ['query', key, '/v', 'SteamPath'], { encoding: 'utf8', timeout: 1200, stdio: ['ignore', 'pipe', 'ignore'] });
      const value = output.match(/SteamPath\s+REG_SZ\s+(.+)$/mi)?.[1]?.trim();
      if (value) candidates.push(value.replace(/\\/g, path.sep));
    } catch { /* this registry location is not present */ }
  }
  return candidates.filter((p, i) => fs.existsSync(p) && candidates.indexOf(p) === i);
}

function steamGames(roots = steamRoots()) {
  const games = [];
  for (const root of roots) {
    const libraries = [root, ...[...readText(path.join(root, 'steamapps/libraryfolders.vdf')).matchAll(/"path"\s+"([^"]+)"/g)].map(m => m[1].replace(/\\\\/g, '\\'))];
    for (const library of new Set(libraries)) {
      const directory = path.join(library, 'steamapps');
      try {
        for (const file of fs.readdirSync(directory).filter(name => /^appmanifest_\d+\.acf$/i.test(name))) {
          const manifest = readText(path.join(directory, file));
          const title = manifest.match(/"name"\s+"([^"]+)"/i)?.[1];
          const id = file.match(/\d+/)?.[0];
          if (title && id) games.push({ id: `steam-${id}`, title, platform: 'Steam', source: 'steam', art: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`, launch: `steam://rungameid/${id}` });
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

function heroicRoots() {
  const home = os.homedir();
  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const heroic = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || '', 'heroic'), path.join(home, '.config', 'heroic')]
    : [path.join(configHome, 'heroic'), path.join(home, '.var/app/com.heroicgameslauncher.hgl/config/heroic')];
  const roots = [];
  for (const base of heroic) {
    roots.push({ base, legendary: path.join(base, 'legendaryConfig', 'legendary') });
    roots.push({ base, legendary: path.join(base, 'legendary') });
  }
  if (process.platform === 'win32') roots.push({ base: path.join(home, '.config', 'heroic'), legendary: path.join(home, '.config', 'legendary') });
  else roots.push({ base: configHome, legendary: path.join(configHome, 'legendary') });
  return roots;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['games', 'installed', 'elements', 'library']) if (Array.isArray(value[key])) return value[key];
  return Object.values(value).filter(item => item && typeof item === 'object');
}

function heroicGames(roots = heroicRoots()) {
  const games = [];
  const addGame = (appName, runner, title, art = '', installed = true) => {
    if (!appName) return;
    const source = runner === 'legendary' ? 'epic' : runner === 'gog' ? 'gog' : runner === 'nile' ? 'amazon' : 'heroic';
    const id = runner === 'legendary' ? `heroic-${appName}` : `heroic-${runner}-${appName}`;
    const platform = runner === 'legendary' ? 'Epic' : 'Heroic';
    games.push({ id, title: title || appName, platform, source: 'heroic', sources: [source, 'heroic'], art, installed, launch: `heroic://launch?appName=${encodeURIComponent(appName)}&runner=${runner}` });
  };
  for (const { base, legendary } of roots) {
    const installed = jsonFile(path.join(legendary, 'installed.json'));
    const installedNames = new Set(Object.keys(installed && typeof installed === 'object' ? installed : {}));
    const metadataDirectory = path.join(legendary, 'metadata');
    try {
      for (const file of fs.readdirSync(metadataDirectory).filter(name => name.toLowerCase().endsWith('.json'))) {
        const appName = path.basename(file, path.extname(file));
        const metadata = jsonFile(path.join(metadataDirectory, file));
        const details = metadata?.metadata || metadata;
        if (!details || typeof details !== 'object' || details.isDLC === true || details.is_dlc === true) continue;
        const title = details.title || metadata.title || appName;
        if (!title || typeof title !== 'string') continue;
        const artwork = details.keyImages?.find(image => ['DieselGameBox', 'OfferImageWide', 'DieselGameBoxTall'].includes(image.type))?.url || '';
        addGame(appName, 'legendary', title, artwork, installedNames.has(appName));
      }
    } catch { /* Heroic may not have synced an Epic library */ }
    // Older Heroic/Legendary data may have installed entries without cached metadata.
    for (const appName of installedNames) {
      if (games.some(game => game.id === `heroic-${appName}`)) continue;
      const info = installed[appName];
      if (info && typeof info === 'object') addGame(appName, 'legendary', info.title || appName, '', true);
    }

    const gogInstalled = jsonFile(path.join(base, 'gog_store', 'installed.json'));
    const gogLibrary = asArray(jsonFile(path.join(base, 'store_cache', 'gog_library.json')));
    const gogById = new Map(gogLibrary.map(game => [String(game.app_name || game.appName || game.id || ''), game]));
    for (const game of asArray(gogInstalled)) {
      const appName = String(game.appName || game.app_name || game.id || '');
      if (!appName || game.is_installed === false) continue;
      if (game.install_path && !fs.existsSync(game.install_path)) continue;
      const info = gogById.get(appName) || game;
      addGame(appName, 'gog', info.title || info.name || appName, info.art || info.cover_url || '');
    }

    const sideload = jsonFile(path.join(base, 'sideload_apps', 'library.json'));
    for (const game of asArray(sideload?.games || sideload)) {
      if (!game.is_installed) continue;
      addGame(game.app_name || game.appName || game.id, 'sideload', game.title || game.name);
    }

    const nileRoot = path.join(base, 'nile_config');
    for (const file of ['installed.json', 'library.json', 'games.json']) {
      const nile = jsonFile(path.join(nileRoot, file));
      for (const game of asArray(nile?.games || nile?.installed || nile)) {
        const id = game.productId || game.product_id || game.app_name || game.appName || game.id;
        const installPath = game.install_path || game.installPath || game.install_dir;
        if (!id || game.installed === false || game.is_installed === false || (installPath && !fs.existsSync(installPath))) continue;
        if (!installPath && game.installed !== true && game.is_installed !== true) continue;
        addGame(id, 'nile', game.title || game.name || id, game.art || game.cover_url || '');
      }
    }
  }
  return [...new Map(games.map(game => [game.id, game])).values()];
}

function epicManifestDirectories() {
  if (process.platform !== 'win32') return [];
  return [path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')];
}

function epicGames(directories = epicManifestDirectories()) {
  const games = [];
  for (const directory of directories) try {
    for (const file of fs.readdirSync(directory).filter(name => name.toLowerCase().endsWith('.item'))) {
      const manifest = jsonFile(path.join(directory, file));
      if (!manifest || typeof manifest !== 'object' || !manifest.AppName) continue;
      if (manifest.InstallLocation && !fs.existsSync(manifest.InstallLocation)) continue;
      const appName = String(manifest.AppName);
      const title = String(manifest.DisplayName || appName);
      games.push({
        id: `epic-${appName}`, title, platform: 'Epic', source: 'epic', sources: ['epic'], installed: true,
        launch: `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`
      });
    }
  } catch { /* Epic Launcher is absent or its manifests are unavailable */ }
  return [...new Map(games.map(game => [game.id, game])).values()];
}

const RIOT_PRODUCTS = {
  league_of_legends: { title: 'League of Legends', executable: path.join('Game', 'League of Legends.exe') },
  valorant: { title: 'VALORANT', executable: path.join('ShooterGame', 'Binaries', 'Win64', 'VALORANT-Win64-Shipping.exe') },
  bacon: { title: 'Legends of Runeterra', executable: path.join('live', 'Game', 'LoR.exe') }
};

function riotConfigFiles() {
  return [path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Riot Games', 'RiotClientInstalls.json'), path.join(process.env.LOCALAPPDATA || '', 'Riot Games', 'RiotClientInstalls.json')];
}

function findRiotClient(configFiles = riotConfigFiles()) {
  for (const file of configFiles) {
    const data = jsonFile(file);
    const candidate = data?.rc_default || data?.rc_live;
    if (typeof candidate === 'string' && path.basename(candidate).toLowerCase() === 'riotclientservices.exe' && fs.existsSync(candidate)) return candidate;
  }
  const programFiles = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const candidates = [path.join(programFiles, 'Riot Games', 'Riot Client', 'RiotClientServices.exe'), path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Riot Games', 'Riot Client', 'RiotClientServices.exe')];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function riotGames(configFiles = riotConfigFiles(), platform = process.platform) {
  if (platform !== 'win32') return [];
  const games = [];
  for (const file of configFiles) {
    const data = jsonFile(file);
    if (!data?.product_settings) continue;
    for (const [key, product] of Object.entries(data.product_settings)) {
      const id = String(product.product_id || key.split('.')[0]).toLowerCase();
      const definition = RIOT_PRODUCTS[id];
      if (!definition || !product.product_install_root) continue;
      const root = path.join(product.product_install_root, product.product_install_dir || '');
      if (!fs.existsSync(path.join(root, definition.executable)) && !fs.existsSync(path.join(root, 'live', definition.executable))) continue;
      const patchline = String(product.patchline_id || product.patchline || 'live').replace(/[^a-z0-9_-]/gi, '');
      games.push({ id: `riot-${id}`, title: definition.title, platform: 'Riot', source: 'riot', launch: `riot://launch/${id}/${patchline}` });
    }
  }
  return [...new Map(games.map(game => [game.id, game])).values()];
}

const BATTLENET_GAMES = [
  { id: 'wow', title: 'World of Warcraft', folder: 'World of Warcraft', executables: [path.join('_retail_', 'Wow.exe'), 'Wow.exe'] },
  { id: 'pro', title: 'Overwatch 2', folder: 'Overwatch', executables: ['Overwatch.exe'] },
  { id: 'fen', title: 'Diablo IV', folder: 'Diablo IV', executables: ['Diablo IV.exe'] },
  { id: 'd3', title: 'Diablo III', folder: 'Diablo III', executables: ['Diablo III.exe'] },
  { id: 'osi', title: 'Diablo II: Resurrected', folder: 'Diablo II Resurrected', executables: ['D2R.exe'] },
  { id: 's2', title: 'StarCraft II', folder: 'StarCraft II', executables: ['StarCraft II.exe'] },
  { id: 'hs', title: 'Hearthstone', folder: 'Hearthstone', executables: ['Hearthstone.exe'] },
  { id: 'w3', title: 'Warcraft III: Reforged', folder: 'Warcraft III', executables: [path.join('_retail_', 'x86_64', 'Warcraft III.exe'), 'Warcraft III.exe'] }
];

function battleNetGames(roots = [process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', process.env.PROGRAMFILES || 'C:\\Program Files'], clients = [path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Battle.net', 'Battle.net.exe'), path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Battle.net', 'Battle.net.exe')], platform = process.platform) {
  if (platform !== 'win32') return [];
  if (!clients.some(client => fs.existsSync(client))) return [];
  const games = [];
  for (const root of roots) for (const game of BATTLENET_GAMES) {
    const candidates = [path.join(root, 'Battle.net', 'Games', game.folder), path.join(root, game.folder), path.join(root, 'Games', game.folder)];
    if (candidates.some(folder => game.executables.some(executable => fs.existsSync(path.join(folder, executable))))) {
      games.push({ id: `battlenet-${game.id}`, title: game.title, platform: 'Battle.net', source: 'battlenet', launch: `battlenet://launch/${game.id}` });
    }
  }
  return [...new Map(games.map(game => [game.id, game])).values()];
}

function findBattleNetClient() {
  const candidates = [path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Battle.net', 'Battle.net.exe'), path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Battle.net', 'Battle.net.exe')];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
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

function scanProviders(scanners) {
  const unique = new Map();
  const providers = scanners.map(([name, scan]) => {
    try {
      const games = [...new Map(scan().map(game => [game.id, game])).values()];
      for (const game of games) unique.set(game.id, game);
      return { name, count: games.length, error: false };
    } catch {
      return { name, count: 0, error: true };
    }
  });
  return { games: [...unique.values()], providers };
}

function scanInstalledGamesDetailed() {
  return scanProviders([
    ['Steam', steamGames], ['Heroic', heroicGames], ['Epic Games', epicGames], ['Lutris', lutrisGames], ['Flatpak', flatpakGames],
    ['Riot', riotGames], ['Battle.net', battleNetGames]
  ]);
}

function scanInstalledGames() { return scanInstalledGamesDetailed().games; }

module.exports = { scanInstalledGames, scanInstalledGamesDetailed, scanProviders, steamGames, heroicGames, heroicRoots, epicGames, epicManifestDirectories, lutrisGames, flatpakGames, riotGames, findRiotClient, battleNetGames, findBattleNetClient };
