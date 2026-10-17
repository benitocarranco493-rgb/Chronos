const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameLauncher } = require('../src/providers/launch');

function windowsLauncher(overrides = {}) {
  const calls = { external: [], paths: [], processes: [] };
  const launcher = createGameLauncher({
    platform: 'win32',
    shell: {
      openExternal: async url => calls.external.push(url),
      openPath: async file => { calls.paths.push(file); return ''; }
    },
    findRiotClient: () => 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
    findBattleNetClient: () => 'C:\\Program Files (x86)\\Battle.net\\Battle.net.exe',
    execFile: (file, args, options, callback) => {
      calls.processes.push({ file, args, options });
      callback(null);
    },
    ...overrides
  });
  return { launcher, calls };
}

test('Windows sends Steam protocol targets to the registered app handler', async () => {
  const { launcher, calls } = windowsLauncher();
  assert.equal(await launcher('steam://rungameid/440'), true);
  assert.deepEqual(calls.external, ['steam://rungameid/440']);
  assert.equal(calls.processes.length, 0);
});

test('Windows launches Riot products with separate arguments and hidden client window', async () => {
  const { launcher, calls } = windowsLauncher();
  assert.equal(await launcher('riot://launch/VALORANT/live'), true);
  assert.equal(calls.processes[0].file, 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe');
  assert.deepEqual(calls.processes[0].args, ['--launch-product=valorant', '--launch-patchline=live']);
  assert.deepEqual(calls.processes[0].options, { windowsHide: true });
});

test('Windows launches Battle.net products through its client', async () => {
  const { launcher, calls } = windowsLauncher();
  assert.equal(await launcher('battlenet://launch/PRO'), true);
  assert.deepEqual(calls.processes[0].args, ['--exec=launch pro']);
});

test('Windows opens executable targets through the OS and reports missing paths', async () => {
  const { launcher, calls } = windowsLauncher();
  assert.equal(await launcher('C:\\Games\\My Game\\game.exe'), true);
  assert.deepEqual(calls.paths, ['C:\\Games\\My Game\\game.exe']);
  const missing = createGameLauncher({ platform: 'win32', shell: { openPath: async () => 'not found' } });
  assert.equal(await missing('C:\\missing.exe'), false);
});

test('Windows returns false when a required Riot client is not installed', async () => {
  const { launcher, calls } = windowsLauncher({ findRiotClient: () => null });
  assert.equal(await launcher('riot://launch/league_of_legends/live'), false);
  assert.equal(calls.processes.length, 0);
});
