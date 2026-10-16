const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { steamGames, heroicGames } = require('../src/providers/library');

function fixture() { return fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-providers-')); }

test('Steam scans app manifests in primary and additional libraries without duplicate IDs', () => {
  const root = fixture();
  try {
    const library = path.join(root, 'extra');
    fs.mkdirSync(path.join(root, 'steamapps'), { recursive: true });
    fs.mkdirSync(path.join(library, 'steamapps'), { recursive: true });
    fs.writeFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { "0" { "path" "${root.replace(/\\/g, '\\\\')}" } "1" { "path" "${library.replace(/\\/g, '\\\\')}" } }`);
    fs.writeFileSync(path.join(root, 'steamapps', 'appmanifest_10.acf'), '"AppState" { "name" "Test Game" }');
    fs.writeFileSync(path.join(library, 'steamapps', 'appmanifest_11.acf'), '"AppState" { "name" "Another Game" }');
    assert.deepEqual(steamGames([root]).map(game => game.id).sort(), ['steam-10', 'steam-11']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Heroic detects Epic and GOG installs from separate local databases', () => {
  const root = fixture();
  try {
    const legendary = path.join(root, 'legendary');
    fs.mkdirSync(path.join(legendary, 'metadata'), { recursive: true });
    fs.mkdirSync(path.join(root, 'gog_store'), { recursive: true });
    fs.writeFileSync(path.join(legendary, 'installed.json'), JSON.stringify({ epic_app: { install_path: '/games/epic' } }));
    fs.writeFileSync(path.join(legendary, 'metadata', 'epic_app.json'), JSON.stringify({ metadata: { title: 'Epic Game' } }));
    fs.writeFileSync(path.join(root, 'gog_store', 'installed.json'), JSON.stringify({ installed: [{ appName: '12345', title: 'GOG Game' }] }));
    const games = heroicGames([{ base: root, legendary }]);
    assert.equal(games.find(game => game.title === 'Epic Game').id, 'heroic-epic_app');
    assert.equal(games.find(game => game.title === 'GOG Game').launch, 'heroic://launch?appName=12345&runner=gog');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
