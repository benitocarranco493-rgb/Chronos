const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 5;

function cleanGame(game) {
  if (!game || typeof game !== 'object' || typeof game.title !== 'string' || !game.title.trim()) return null;
  const id = typeof game.id === 'string' && game.id ? game.id : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id, title: game.title.trim().slice(0, 240),
    platform: typeof game.platform === 'string' ? game.platform.slice(0, 40) : 'Manual',
    art: typeof game.art === 'string' ? game.art.slice(0, 2048) : '',
    artPosition: ['top', 'center', 'bottom'].includes(game.artPosition) ? game.artPosition : 'center',
    labelColor: typeof game.labelColor === 'string' && /^#[0-9a-f]{6}$/i.test(game.labelColor) ? game.labelColor : '',
    launch: typeof game.launch === 'string' ? game.launch.slice(0, 2048) : '',
    added: Number.isFinite(game.added) ? game.added : Date.now(),
    source: typeof game.source === 'string' ? game.source.slice(0, 40) : (typeof game.platform === 'string' ? game.platform.toLowerCase() : 'manual'),
    sources: Array.isArray(game.sources) ? [...new Set(game.sources.filter(source => typeof source === 'string').map(source => source.slice(0, 40)))].slice(0, 12) : [],
    dlcs: Array.isArray(game.dlcs) ? game.dlcs.filter(dlc => dlc && typeof dlc.id === 'string' && typeof dlc.title === 'string' && dlc.title.trim()).slice(0, 100).map(dlc => ({ id: dlc.id.slice(0, 160), title: dlc.title.trim().slice(0, 240), art: typeof dlc.art === 'string' ? dlc.art.slice(0, 2048) : '', source: typeof dlc.source === 'string' ? dlc.source.slice(0, 40) : 'epic-account' })) : [],
    launchOptions: Array.isArray(game.launchOptions) ? game.launchOptions.filter(option => option && typeof option.launch === 'string').slice(0, 12).map(option => ({ platform: String(option.platform || '').slice(0, 40), source: String(option.source || '').slice(0, 40), launch: option.launch.slice(0, 2048) })) : [],
    favorite: game.favorite === true,
    lastPlayed: Number.isFinite(game.lastPlayed) ? game.lastPlayed : 0,
    installed: game.installed === false ? false : game.installed === true,
    playtimeMinutes: Number.isFinite(game.playtimeMinutes) ? Math.max(0, game.playtimeMinutes) : 0,
    playtimeKnown: game.playtimeKnown === true || (Number.isFinite(game.playtimeMinutes) && game.playtimeMinutes > 0),
    localPlaytimeMinutes: Number.isFinite(game.localPlaytimeMinutes) ? Math.max(0, game.localPlaytimeMinutes) : 0,
    sessions: Array.isArray(game.sessions) ? game.sessions.filter(item => item && Number.isFinite(item.startedAt) && Number.isFinite(item.endedAt) && Number.isFinite(item.durationSeconds) && item.durationSeconds >= 0).slice(-100).map(item => ({ startedAt: item.startedAt, endedAt: item.endedAt, durationSeconds: Math.round(item.durationSeconds) })) : [],
    genres: Array.isArray(game.genres) ? [...new Set(game.genres.filter(value => typeof value === 'string').map(value => value.trim().slice(0, 60)).filter(Boolean))].slice(0, 30) : [],
    genresFetchedAt: Number.isFinite(game.genresFetchedAt) ? game.genresFetchedAt : 0,
    steamMetadata: game.steamMetadata && typeof game.steamMetadata === 'object' ? {
      developers: Array.isArray(game.steamMetadata.developers) ? game.steamMetadata.developers.filter(value => typeof value === 'string').slice(0, 8).map(value => value.slice(0, 120)) : [],
      publishers: Array.isArray(game.steamMetadata.publishers) ? game.steamMetadata.publishers.filter(value => typeof value === 'string').slice(0, 8).map(value => value.slice(0, 120)) : [],
      releaseDate: typeof game.steamMetadata.releaseDate === 'string' ? game.steamMetadata.releaseDate.slice(0, 80) : '',
      description: typeof game.steamMetadata.description === 'string' ? game.steamMetadata.description.slice(0, 1600) : '',
      reviewScore: Number.isFinite(game.steamMetadata.reviewScore) ? Math.max(0, Math.min(100, game.steamMetadata.reviewScore)) : null,
      genres: Array.isArray(game.steamMetadata.genres) ? game.steamMetadata.genres.filter(value => typeof value === 'string').slice(0, 20).map(value => value.slice(0, 60)) : [],
      features: Array.isArray(game.steamMetadata.features) ? game.steamMetadata.features.filter(value => typeof value === 'string').slice(0, 20).map(value => value.slice(0, 80)) : [],
      screenshots: Array.isArray(game.steamMetadata.screenshots) ? game.steamMetadata.screenshots.filter(value => typeof value === 'string' && /^https:\/\/(?:cdn\d*\.akamai|shared\.akamai|cdn\d*)\.steamstatic\.com\//i.test(value)).slice(0, 12) : [],
      trailers: Array.isArray(game.steamMetadata.trailers) ? game.steamMetadata.trailers.filter(item => item && typeof item.url === 'string' && /^https:\/\/(?:video|cdn\d*)\.akamai\.steamstatic\.com\//i.test(item.url)).slice(0, 5).map(item => ({ title: String(item.title || 'Trailer').slice(0, 120), url: item.url.slice(0, 2048), poster: typeof item.poster === 'string' ? item.poster.slice(0, 2048) : '' })) : []
    } : null,
    steamMetadataFetchedAt: Number.isFinite(game.steamMetadataFetchedAt) ? game.steamMetadataFetchedAt : 0,
    hidden: game.hidden === true
  };
}

function cleanSettings(settings) {
  const safe = settings && typeof settings === 'object' && !Array.isArray(settings) ? { ...settings } : {};
  delete safe['steam-key'];
  delete safe['sgdb-key'];
  return safe;
}

function migrate(database) {
  let current = { ...database };
  let version = Number.isInteger(current.schemaVersion) ? current.schemaVersion : 0;
  if (version < 1) {
    current = { schemaVersion: 1, games: Array.isArray(current.games) ? current.games : [], settings: current.settings || {} };
    version = 1;
  }
  if (version < 2) {
    current = { ...current, schemaVersion: 2, playNext: Array.isArray(current.playNext) ? current.playNext : [], playNextStore: Array.isArray(current.playNextStore) ? current.playNextStore : [] };
    version = 2;
  }
  if (version < 3) { current = { ...current, schemaVersion: 3 }; version = 3; }
  if (version < 4) { current = { ...current, schemaVersion: 4 }; version = 4; }
  if (version < 5) { current = { ...current, schemaVersion: 5, wishlist: Array.isArray(current.wishlist) ? current.wishlist : [] }; version = 5; }
  if (version !== SCHEMA_VERSION) throw new Error(`Unsupported Chronos data version: ${version}`);
  const uniqueGames = new Map();
  for (const game of (Array.isArray(current.games) ? current.games : []).map(cleanGame).filter(Boolean)) {
    if (!uniqueGames.has(game.id)) uniqueGames.set(game.id, game);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    games: [...uniqueGames.values()],
    settings: cleanSettings(current.settings),
    playNext: [...new Set((Array.isArray(current.playNext) ? current.playNext : []).filter(id => typeof id === 'string'))].slice(0, 1000),
    playNextStore: (Array.isArray(current.playNextStore) ? current.playNextStore : []).filter(item => item && typeof item.title === 'string' && typeof item.url === 'string' && /^https:\/\/(store\.steampowered\.com|store\.epicgames\.com)\//i.test(item.url)).slice(0, 100).map(item => ({ store: item.store === 'epic' ? 'epic' : 'steam', title: item.title.slice(0, 240), url: item.url.slice(0, 2048), art: typeof item.art === 'string' ? item.art.slice(0, 2048) : '' })),
    wishlist: (Array.isArray(current.wishlist) ? current.wishlist : []).filter(item => item && typeof item.title === 'string' && typeof item.url === 'string' && /^https:\/\/(store\.steampowered\.com|store\.epicgames\.com)\//i.test(item.url)).slice(0, 500).map(item => ({ store: item.store === 'epic' ? 'epic' : 'steam', id: typeof item.id === 'string' ? item.id.slice(0, 120) : '', title: item.title.slice(0, 240), url: item.url.slice(0, 2048), art: typeof item.art === 'string' ? item.art.slice(0, 2048) : '', currentPrice: Number.isFinite(item.currentPrice) ? Math.max(0, item.currentPrice) : null, previousPrice: Number.isFinite(item.previousPrice) ? Math.max(0, item.previousPrice) : null, currency: typeof item.currency === 'string' ? item.currency.slice(0, 8) : '', checkedAt: Number.isFinite(item.checkedAt) ? item.checkedAt : 0 }))
  };
}

function createStore(userDataPath) {
  const databasePath = path.join(userDataPath, 'library.json');
  function write(database, { backup = true } = {}) {
    fs.mkdirSync(userDataPath, { recursive: true });
    const tempPath = `${databasePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(database, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    if (backup && fs.existsSync(databasePath)) fs.copyFileSync(databasePath, `${databasePath}.bak`);
    fs.renameSync(tempPath, databasePath);
  }
  function load(legacy = {}) {
    let database;
    if (fs.existsSync(databasePath)) {
      let saved;
      try { saved = JSON.parse(fs.readFileSync(databasePath, 'utf8')); }
      catch (error) {
        const backupPath = `${databasePath}.bak`;
        if (!(error instanceof SyntaxError) || !fs.existsSync(backupPath)) throw error;
        database = migrate(JSON.parse(fs.readFileSync(backupPath, 'utf8')));
        fs.renameSync(databasePath, `${databasePath}.corrupt-${Date.now()}`);
        write(database, { backup: false });
        return database;
      }
      database = migrate(saved);
      if (JSON.stringify(saved) !== JSON.stringify(database)) {
        const containsPlaintextCredentials = Boolean(saved.settings?.['steam-key'] || saved.settings?.['sgdb-key']);
        write(database, { backup: !containsPlaintextCredentials });
      }
    } else {
      const legacyGames = Array.isArray(legacy.games) ? legacy.games : [];
      const legacySettings = legacy.settings && typeof legacy.settings === 'object' ? legacy.settings : {};
      database = migrate({ games: legacyGames, settings: legacySettings });
      write(database);
    }
    return database;
  }
  function save(input) {
    const database = migrate(input);
    write(database);
    return database;
  }
  return { load, save };
}

module.exports = { createStore, cleanGame, migrate };
