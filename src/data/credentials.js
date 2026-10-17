const fs = require('node:fs');
const path = require('node:path');

const KEY_NAMES = { steam: 'steam-key', steamgriddb: 'sgdb-key', epic: 'epic-session' };

function createCredentialStore(userDataPath, safeStorage, platform) {
  const filePath = path.join(userDataPath, 'credentials.json');
  let cache = null;
  async function available() {
    try {
      if (!await safeStorage.isAsyncEncryptionAvailable()) return false;
      if (platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend())) return false;
      return true;
    } catch { return false; }
  }
  function read() {
    if (cache) return cache;
    try { cache = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { cache = {}; }
    return cache;
  }
  function write(value) {
    fs.mkdirSync(userDataPath, { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    cache = value;
  }
  async function status() {
    return { secureStorageAvailable: await available(), steam: Boolean(read().steam), steamgriddb: Boolean(read().steamgriddb), epic: Boolean(read().epic) };
  }
  async function set(provider, value) {
    if (!KEY_NAMES[provider] || typeof value !== 'string') return false;
    const canEncrypt = await available();
    if (!canEncrypt && value.trim()) return false;
    try {
      const current = { ...read() };
      if (value.trim()) current[provider] = (await safeStorage.encryptStringAsync(value.trim())).toString('base64');
      else delete current[provider];
      write(current);
      return true;
    } catch { return false; }
  }
  async function get(provider) {
    if (!KEY_NAMES[provider] || !await available()) return null;
    const encoded = read()[provider];
    if (!encoded) return null;
    try {
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(encoded, 'base64'));
      if (decrypted.shouldReEncrypt) await set(provider, decrypted.result);
      return decrypted.result;
    } catch { return null; }
  }
  async function migrateLegacy(settings = {}) {
    let migrated = true;
    for (const [provider, key] of Object.entries(KEY_NAMES)) {
      if (typeof settings[key] === 'string' && settings[key]) migrated = await set(provider, settings[key]) && migrated;
    }
    return migrated;
  }
  return { available, status, set, get, migrateLegacy };
}

module.exports = { createCredentialStore };
