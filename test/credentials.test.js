const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCredentialStore } = require('../src/data/credentials');

function temporaryDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-credentials-')); }
const safeStorage = {
  isAsyncEncryptionAvailable: async () => true,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptStringAsync: async value => Buffer.from(`encrypted:${value}`),
  decryptStringAsync: async bytes => ({ result: bytes.toString().replace(/^encrypted:/, ''), shouldReEncrypt: false })
};

test('stores credentials encrypted and migrates old key fields without returning the secrets', async () => {
  const directory = temporaryDirectory();
  try {
    const vault = createCredentialStore(directory, safeStorage, 'linux');
    assert.equal(await vault.migrateLegacy({ 'steam-key': 'steam-secret', 'sgdb-key': 'art-secret' }), true);
    const status = await vault.status();
    assert.equal(status.steam, true);
    assert.equal(status.steamgriddb, true);
    const saved = fs.readFileSync(path.join(directory, 'credentials.json'), 'utf8');
    assert.equal(saved.includes('steam-secret'), false);
    assert.equal(await vault.get('steam'), 'steam-secret');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('refuses to save a key when Linux falls back to basic text encryption', async () => {
  const directory = temporaryDirectory();
  try {
    const fallback = { ...safeStorage, getSelectedStorageBackend: () => 'basic_text' };
    const vault = createCredentialStore(directory, fallback, 'linux');
    assert.equal(await vault.set('steam', 'secret'), false);
    assert.equal(fs.existsSync(path.join(directory, 'credentials.json')), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
