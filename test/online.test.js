const test = require('node:test');
const assert = require('node:assert/strict');
const { importSteamLibrary, resolveSteamId, searchGridArt } = require('../src/providers/online');

const steamId = '76561198000000000';

test('Steam library import validates SteamID64 and maps account games without exposing the API key', async () => {
  await assert.rejects(importSteamLibrary('key', '123', async () => {}), /17-digit SteamID64/);
  let requestUrl;
  const games = await importSteamLibrary('secret-key', steamId, async url => {
    requestUrl = new URL(url);
    return { ok: true, json: async () => ({ response: { games: [{ appid: 42, name: 'Owned Game', playtime_forever: 125 }] } }) };
  });
  assert.equal(requestUrl.searchParams.get('key'), 'secret-key');
  assert.equal(games[0].id, 'steam-42');
  assert.equal(games[0].installed, false);
  assert.equal(games[0].playtimeMinutes, 125);
  assert.equal(games[0].launch, 'steam://rungameid/42');
});

test('SteamGridDB searches using the bearer key and returns cover choices', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? { ok: true, json: async () => ({ data: [{ id: 9, name: 'Game' }] }) }
      : { ok: true, json: async () => ({ data: [{ url: 'https://cdn2.steamgriddb.com/grid/a.jpg', thumbs: { small: 'https://cdn2.steamgriddb.com/thumb/a.jpg' } }] }) };
  };
  const results = await searchGridArt('sgdb-secret', 'Game', fetchImpl);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sgdb-secret');
  assert.equal(results[0].title, 'Game');
  assert.match(results[0].url, /^https:\/\/cdn2\.steamgriddb\.com/);
});

test('Steam account import accepts a public vanity profile URL', async () => {
  const calls = [];
  const games = await importSteamLibrary('secret-key', 'https://steamcommunity.com/id/example-player/', async url => {
    const request = new URL(url);
    calls.push(request);
    if (request.pathname.includes('ResolveVanityURL')) return { ok: true, json: async () => ({ response: { success: 1, steamid: steamId } }) };
    return { ok: true, json: async () => ({ response: { games: [{ appid: 7, name: 'Profile Game' }] } }) };
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get('vanityurl'), 'example-player');
  assert.equal(calls[0].searchParams.get('key'), 'secret-key');
  assert.equal(calls[1].searchParams.get('steamid'), steamId);
  assert.equal(games[0].title, 'Profile Game');
});

test('Steam profile resolution accepts numeric profile URLs and rejects unrelated domains', async () => {
  assert.equal(await resolveSteamId(`https://steamcommunity.com/profiles/${steamId}`), steamId);
  await assert.rejects(resolveSteamId('https://example.com/id/someone', 'key'), /steamcommunity\.com/);
});
