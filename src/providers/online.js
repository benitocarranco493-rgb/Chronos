const STEAM_API = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/';
const STEAM_RESOLVE_API = 'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/';
const STEAM_ACHIEVEMENTS_API = 'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/';
const STEAM_SCHEMA_API = 'https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/';
const GRID_API = 'https://www.steamgriddb.com/api/v2';

async function resolveSteamId(profile, apiKey, fetchImpl = fetch) {
  const input = String(profile || '').trim();
  if (/^\d{17}$/.test(input)) return input;
  if (/^\d+$/.test(input)) throw new Error('Enter a Steam profile URL, vanity name, or 17-digit SteamID64.');

  let url;
  try {
    const profileUrl = input.includes('://') ? input : input.startsWith('steamcommunity.com/') ? `https://${input}` : `https://steamcommunity.com/id/${encodeURIComponent(input)}`;
    url = new URL(profileUrl);
  } catch { throw new Error('Enter a Steam profile URL, vanity name, or 17-digit SteamID64.'); }
  if (!['steamcommunity.com', 'www.steamcommunity.com'].includes(url.hostname.toLowerCase())) throw new Error('Use a profile from steamcommunity.com.');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'profiles' && /^\d{17}$/.test(parts[1] || '')) return parts[1];
  if (parts[0] !== 'id' || !/^[a-z0-9_-]{2,64}$/i.test(parts[1] || '')) throw new Error('Enter a Steam profile URL, vanity name, or 17-digit SteamID64.');
  if (!apiKey) throw new Error('Save a Steam Web API key in Settings first.');

  const resolveUrl = new URL(STEAM_RESOLVE_API);
  resolveUrl.search = new URLSearchParams({ key: apiKey, vanityurl: parts[1] }).toString();
  const response = await fetchImpl(resolveUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Steam profile lookup returned HTTP ${response.status}. Check the profile and API key.`);
  const resolved = (await response.json()).response;
  if (resolved?.success !== 1 || !/^\d{17}$/.test(String(resolved.steamid || ''))) throw new Error('Steam could not resolve that public profile.');
  return String(resolved.steamid);
}

async function importSteamLibrary(apiKey, steamProfile, fetchImpl = fetch) {
  if (!apiKey) throw new Error('Save a Steam Web API key in Settings first.');
  const steamId = await resolveSteamId(steamProfile, apiKey, fetchImpl);
  const url = new URL(STEAM_API);
  url.search = new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: 'true', include_played_free_games: 'true', format: 'json' }).toString();
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Steam API returned HTTP ${response.status}. Check the key, SteamID, and profile visibility.`);
  const payload = await response.json();
  const ownedGames = payload?.response?.games;
  if (!Array.isArray(ownedGames)) throw new Error('Steam did not return a library. Check the API key and make sure your game details are public.');
  return ownedGames.map(game => ({
    id: `steam-${game.appid}`, title: game.name || `Steam app ${game.appid}`, platform: 'Steam', source: 'steam-account', sources: ['steam-account'],
    art: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
    launch: `steam://rungameid/${game.appid}`, playtimeMinutes: Number(game.playtime_forever) || 0,
    playtimeKnown: Number.isFinite(Number(game.playtime_forever)), installed: false
  }));
}

async function getSteamGameDetails(apiKey, steamProfile, appId, fetchImpl = fetch) {
  if (!apiKey) throw new Error('Save a Steam Web API key in Settings to load achievements.');
  const gameId = String(appId || '');
  if (!/^\d{1,10}$/.test(gameId)) throw new Error('This Steam game has an invalid app ID.');
  const steamId = await resolveSteamId(steamProfile, apiKey, fetchImpl);
  const playerUrl = new URL(STEAM_ACHIEVEMENTS_API);
  playerUrl.search = new URLSearchParams({ key: apiKey, steamid: steamId, appid: gameId, l: 'english' }).toString();
  const schemaUrl = new URL(STEAM_SCHEMA_API);
  schemaUrl.search = new URLSearchParams({ key: apiKey, appid: gameId, l: 'english', format: 'json' }).toString();
  const [playerResponse, schemaResponse] = await Promise.all([
    fetchImpl(playerUrl, { signal: AbortSignal.timeout(15000) }),
    fetchImpl(schemaUrl, { signal: AbortSignal.timeout(15000) })
  ]);
  if (!playerResponse.ok) {
    let reason = '';
    try {
      const body = await playerResponse.text();
      try {
        const payload = JSON.parse(body);
        reason = payload?.playerstats?.error || payload?.error || payload?.response?.error || '';
      } catch { reason = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180); }
    } catch { /* Steam may return an empty error response. */ }
    const normalizedReason = reason.toLowerCase();
    if (normalizedReason.includes('requested app has no stats') || normalizedReason.includes('no stats')) {
      return { unavailable: true, unavailableReason: 'This game does not publish achievement stats through Steam.' };
    }
    if (playerResponse.status === 403 && normalizedReason.includes('profile is not public')) {
      return { unavailable: true, unavailableReason: 'Set your Steam profile and game details to Public to view achievements.' };
    }
    return {
      unavailable: true,
      unavailableReason: playerResponse.status === 403
        ? 'Steam is not allowing achievement access. Check your profile visibility and API key.'
        : `Steam could not load achievements (HTTP ${playerResponse.status}). Try again later.`
    };
  }
  const playerStats = (await playerResponse.json())?.playerstats;
  if (playerStats?.success !== true || !Array.isArray(playerStats.achievements)) {
    return { unavailable: true, unavailableReason: 'Steam did not provide achievement data for this game.' };
  }

  let schemaAchievements = [];
  if (schemaResponse.ok) {
    try {
      const schema = (await schemaResponse.json())?.game?.availableGameStats?.achievements;
      if (Array.isArray(schema)) schemaAchievements = schema;
    } catch { /* Achievement unlocks still work without localized schema details. */ }
  }
  const unlockedByName = new Map(playerStats.achievements.map(item => [item.apiname, item]));
  const definitions = schemaAchievements.length ? schemaAchievements : playerStats.achievements;
  const achievements = definitions.slice(0, 500).map(item => {
    const progress = unlockedByName.get(item.name || item.apiname);
    const unlocked = Number(progress?.achieved) === 1;
    const hidden = Number(item.hidden) === 1 && !unlocked;
    const rawIcons = unlocked
      ? [item.icon, item.icon_gray, item.icongray, progress?.icon, progress?.icon_gray, progress?.icongray]
      : [item.icongray, item.icon_gray, item.icon, progress?.icongray, progress?.icon_gray, progress?.icon];
    const icons = [...new Set(rawIcons.map(value => {
      const url = String(value || '').trim();
      return url.startsWith('//') ? `https:${url}` : url;
    }).filter(url => /^https:\/\//i.test(url)))].slice(0, 3);
    return {
      name: hidden ? 'Secret achievement' : String(item.displayName || item.name || item.apiname || 'Achievement').slice(0, 120),
      description: hidden ? 'Unlock this achievement to reveal its details.' : String(item.description || '').slice(0, 400),
      icon: (icons[0] || '').slice(0, 2048),
      iconFallbacks: icons.slice(1).map(url => url.slice(0, 2048)),
      unlocked,
      unlockTime: Number(progress?.unlocktime) || 0
    };
  });
  const unlocked = achievements.filter(item => item.unlocked).length;
  return { gameName: String(playerStats.gameName || '').slice(0, 200), unlocked, total: achievements.length, totalKnown: schemaAchievements.length > 0, achievements };
}

async function searchGridArt(apiKey, title, fetchImpl = fetch) {
  if (!apiKey) throw new Error('Save a SteamGridDB API key in Settings first.');
  const query = String(title || '').trim().slice(0, 100);
  if (!query) return [];
  const response = await fetchImpl(`${GRID_API}/search/autocomplete/${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`SteamGridDB returned HTTP ${response.status}. Check the key and connection.`);
  const payload = await response.json();
  const games = (Array.isArray(payload.data) ? payload.data : []).map(item => item?.data && typeof item.data === 'object' ? item.data : item).filter(game => game && game.id).slice(0, 5);
  const failures = [];
  const grids = await Promise.all(games.map(async game => {
    const params = new URLSearchParams({ dimensions: '600x900,342x482', types: 'static', nsfw: 'false', humor: 'false' });
    const result = await fetchImpl(`${GRID_API}/grids/game/${encodeURIComponent(game.id)}?${params}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000) });
    if (!result.ok) {
      if (result.status !== 404) failures.push(result.status);
      return [];
    }
    const data = await result.json();
    return (data.data || []).slice(0, 6).map(item => ({ title: game.name, url: item.url, thumb: item.thumbs?.small || item.thumb || item.url }));
  }));
  const results = grids.flat().slice(0, 12);
  if (!results.length && failures.length) {
    const status = failures.includes(401) ? 401 : failures.includes(403) ? 403 : failures[0];
    throw new Error(`SteamGridDB artwork lookup returned HTTP ${status}. Check that the saved API key is valid and try again.`);
  }
  return results;
}

module.exports = { importSteamLibrary, resolveSteamId, getSteamGameDetails, searchGridArt };
