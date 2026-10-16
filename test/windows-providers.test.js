const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { riotGames, battleNetGames, findRiotClient, heroicGames, scanProviders } = require('../src/providers/library');

function fixture() { return fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-windows-providers-')); }

test('Riot scanner identifies installed League and Valorant from RiotClientInstalls metadata', () => {
  const root = fixture();
  try {
    const client = path.join(root, 'RiotClientServices.exe');
    const league = path.join(root, 'League of Legends');
    const valorant = path.join(root, 'VALORANT', 'live');
    fs.writeFileSync(client, '');
    fs.mkdirSync(path.join(league, 'Game'), { recursive: true });
    fs.mkdirSync(path.join(valorant, 'ShooterGame', 'Binaries', 'Win64'), { recursive: true });
    fs.writeFileSync(path.join(league, 'Game', 'League of Legends.exe'), '');
    fs.writeFileSync(path.join(valorant, 'ShooterGame', 'Binaries', 'Win64', 'VALORANT-Win64-Shipping.exe'), '');
    const config = path.join(root, 'RiotClientInstalls.json');
    fs.writeFileSync(config, JSON.stringify({ rc_default: client, product_settings: {
      'league_of_legends.live': { product_id: 'league_of_legends', product_install_root: league, product_install_dir: '.', patchline_id: 'live' },
      'valorant.live': { product_id: 'valorant', product_install_root: path.dirname(valorant), product_install_dir: 'live', patchline_id: 'live' },
      'other.live': { product_id: 'unknown', product_install_root: root }
    } }));
    assert.equal(findRiotClient([config]), client);
    assert.deepEqual(riotGames([config], 'win32').map(game => game.id).sort(), ['riot-league_of_legends', 'riot-valorant']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Battle.net scanner requires both its client and a known installed game executable', () => {
  const root = fixture();
  try {
    const client = path.join(root, 'Battle.net.exe');
    const games = path.join(root, 'Battle.net', 'Games', 'World of Warcraft', '_retail_');
    fs.mkdirSync(games, { recursive: true });
    fs.writeFileSync(client, '');
    fs.writeFileSync(path.join(games, 'Wow.exe'), '');
    const found = battleNetGames([root], [client], 'win32');
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'battlenet-wow');
    assert.equal(found[0].launch, 'battlenet://launch/wow');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Heroic imports installed Amazon games from Nile local metadata', () => {
  const root = fixture();
  try {
    const base = path.join(root, 'heroic');
    const legendary = path.join(base, 'legendaryConfig', 'legendary');
    fs.mkdirSync(path.join(base, 'nile_config'), { recursive: true });
    fs.mkdirSync(legendary, { recursive: true });
    fs.writeFileSync(path.join(base, 'nile_config', 'library.json'), JSON.stringify({ games: [{ productId: 'amazon-123', title: 'Amazon Game', installed: true }] }));
    const found = heroicGames([{ base, legendary }]);
    assert.equal(found.find(game => game.title === 'Amazon Game').launch, 'heroic://launch?appName=amazon-123&runner=nile');
    assert.equal(found.find(game => game.title === 'Amazon Game').sources.includes('amazon'), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('provider scan reports one broken provider without discarding healthy results', () => {
  const result = scanProviders([
    ['Steam', () => [{ id: 'steam-1', title: 'Steam game' }]],
    ['Heroic', () => { throw new Error('broken config'); }]
  ]);
  assert.equal(result.games.length, 1);
  assert.deepEqual(result.providers, [{ name: 'Steam', count: 1, error: false }, { name: 'Heroic', count: 0, error: true }]);
});


