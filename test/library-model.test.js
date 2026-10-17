const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeDiscoveredGames } = require('../src/data/library');

test('scanning keeps a manual entry separate from an auto-detected game with the same title', () => {
  const manual = { id: 'manual-1', title: 'Same title', platform: 'Manual', source: 'manual', sources: ['manual'], launch: 'C:\\Games\\custom.exe' };
  const detected = { id: 'steam-42', title: 'Same title', platform: 'Steam', source: 'steam', launch: 'steam://rungameid/42' };
  const result = mergeDiscoveredGames([manual], [detected]);

  assert.equal(result.added, 1);
  assert.equal(result.games.length, 2);
  assert.equal(result.games[0].id, manual.id);
  assert.deepEqual(result.games[0].sources, ['manual']);
  assert.equal(result.games[0].launch, manual.launch);
  assert.equal(result.games[1].id, detected.id);
});

test('scanning merges matching detected sources and keeps their launch targets', () => {
  const steam = { id: 'steam-42', title: 'Same title', platform: 'Steam', source: 'steam', launch: 'steam://rungameid/42' };
  const heroic = { id: 'heroic-42', title: 'same title', platform: 'Heroic', source: 'heroic', launch: 'heroic://launch?appName=42&runner=legendary' };
  const result = mergeDiscoveredGames([steam], [heroic]);

  assert.equal(result.added, 0);
  assert.equal(result.games.length, 1);
  assert.deepEqual(result.games[0].sources, ['steam', 'heroic']);
  assert.equal(result.games[0].launchOptions.length, 2);
});
