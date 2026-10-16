const STEAM_API = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/';
const GRID_API = 'https://www.steamgriddb.com/api/v2';

async function importSteamLibrary(apiKey, steamId, fetchImpl = fetch) {
  if (!/^\d{17}$/.test(String(steamId || ''))) throw new Error('Enter a 17-digit SteamID64 in Settings.');
  if (!apiKey) throw new Error('Save a Steam Web API key in Settings first.');
  const url = new URL(STEAM_API);
  url.search = new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: 'true', include_played_free_games: 'true', format: 'json' }).toString();
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Steam API returned HTTP ${response.status}. Check the key, SteamID, and profile visibility.`);
  const payload = await response.json();
  return (payload.response?.games || []).map(game => ({
    id: `steam-${game.appid}`, title: game.name || `Steam app ${game.appid}`, platform: 'Steam', source: 'steam-account', sources: ['steam-account'],
    art: game.img_logo_url ? `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg` : '',
    launch: `steam://rungameid/${game.appid}`, playtimeMinutes: Number(game.playtime_forever) || 0, installed: false
  }));
}

async function searchGridArt(apiKey, title, fetchImpl = fetch) {
  if (!apiKey) throw new Error('Save a SteamGridDB API key in Settings first.');
  const query = String(title || '').trim().slice(0, 100);
  if (!query) return [];
  const response = await fetchImpl(`${GRID_API}/search/autocomplete/${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`SteamGridDB returned HTTP ${response.status}. Check the key and connection.`);
  const payload = await response.json();
  const games = (payload.data || []).slice(0, 5);
  const grids = await Promise.all(games.map(async game => {
    const result = await fetchImpl(`${GRID_API}/grids/game/${encodeURIComponent(game.id)}?dimensions=600x900&types=static&nsfw=0&humor=0`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12000) });
    if (!result.ok) return [];
    const data = await result.json();
    return (data.data || []).slice(0, 6).map(item => ({ title: game.name, url: item.url, thumb: item.thumbs?.small || item.url }));
  }));
  return grids.flat().slice(0, 12);
}

module.exports = { importSteamLibrary, searchGridArt };
