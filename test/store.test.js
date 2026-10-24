const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore, migrate } = require('../src/data/store');

function temporaryDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-store-')); }

test('migrates legacy games, removes keys, and deduplicates stable ids', () => {
  const database = migrate({ games: [
    { id: 'steam-1', title: '  Example  ', platform: 'Steam' },
    { id: 'steam-1', title: 'Duplicate', platform: 'Steam' },
    { id: 'manual-2', title: 'Manual' },
    { title: '   ' }
  ], settings: { region: 'ES', 'steam-key': 'must-not-be-saved' } });

  assert.equal(database.schemaVersion, 4);
  assert.equal(database.games.length, 2);
  assert.equal(database.games[0].title, 'Example');
  assert.deepEqual(database.settings, { region: 'ES' });
});

test('imports the old browser library once and maintains a prior backup', () => {
  const directory = temporaryDirectory();
  try {
    const store = createStore(directory);
    const imported = store.load({ games: [{ id: 'manual-1', title: 'Old save', platform: 'Manual' }], settings: { region: 'US' } });
    assert.equal(imported.games[0].title, 'Old save');
    store.save({ ...imported, games: [{ id: 'manual-2', title: 'New save' }] });
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'library.json.bak'), 'utf8')).games[0].title, 'Old save');
    assert.equal(store.load({ games: [{ id: 'ignored', title: 'Stale localStorage' }] }).games[0].title, 'New save');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('recovers a malformed library from the last valid backup', () => {
  const directory = temporaryDirectory();
  try {
    const store = createStore(directory);
    store.load({ games: [{ id: 'manual-1', title: 'Recover me' }] });
    store.save({ schemaVersion: 1, games: [{ id: 'manual-2', title: 'Second save' }], settings: {} });
    fs.writeFileSync(path.join(directory, 'library.json'), '{broken');
    const recovered = store.load();
    assert.equal(recovered.games[0].title, 'Recover me');
    assert.equal(fs.readdirSync(directory).some(name => name.startsWith('library.json.corrupt-')), true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('does not replace a library with an unsupported future schema', () => {
  assert.throws(() => migrate({ schemaVersion: 99, games: [] }), /Unsupported Chronos data version/);
});
