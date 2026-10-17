const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const OAUTH = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth';
const LIBRARY = 'https://library-service.live.use1a.on.epicgames.com/library/api/public/items';
const CATALOG = 'https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace';
const USER_AGENT = 'UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit';

function epicLoginUrl() {
  const redirect = `https://www.epicgames.com/id/api/redirect?clientId=${CLIENT_ID}&responseType=code`;
  return `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(redirect)}`;
}

async function epicRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.errorMessage || body.error_description || body.errorCode;
    throw new Error(detail ? `Epic returned HTTP ${response.status}: ${detail}` : `Epic returned HTTP ${response.status}.`);
  }
  return body;
}

function authHeaders() {
  return { Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' };
}

async function tokenRequest(params) {
  return epicRequest(`${OAUTH}/token`, { method: 'POST', headers: authHeaders(), body: new URLSearchParams({ ...params, token_type: 'eg1' }) });
}

async function connectEpic(authorizationCode) {
  let code = String(authorizationCode || '').trim();
  if (code.startsWith('{')) {
    try { code = JSON.parse(code).authorizationCode || JSON.parse(code).code || code; } catch { /* leave it for the validation message */ }
  } else if (/^https:\/\//i.test(code)) {
    try { const url = new URL(code); code = url.searchParams.get('code') || url.searchParams.get('authorizationCode') || code; } catch { /* leave it for the validation message */ }
  }
  if (!code || code.length > 2048 || /[\r\n\s{}]/.test(code)) throw new Error('Paste only the authorizationCode value returned by Epic.');
  const token = await tokenRequest({ grant_type: 'authorization_code', code });
  if (!token.access_token || !token.refresh_token) throw new Error('Epic did not return a usable login session.');
  return { ...token, expires_at: Date.now() + Number(token.expires_in || 7200) * 1000 };
}

async function refreshEpicSession(session) {
  if (!session?.refresh_token) throw new Error('Connect your Epic account again to import its library.');
  const token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refresh_token });
  return { ...session, ...token, expires_at: Date.now() + Number(token.expires_in || 7200) * 1000 };
}

async function epicLibrary(session, persistSession = async () => {}) {
  if (!session?.access_token) throw new Error('Connect your Epic account in Settings first.');
  let activeSession = session;
  let refreshedAfterUnauthorized = false;
  if (Number(activeSession.expires_at || 0) < Date.now() + 60000) {
    activeSession = await refreshEpicSession(activeSession);
    await persistSession(activeSession);
  }
  const records = [];
  let cursor = '';
  const seenCursors = new Set();
  do {
    const url = new URL(LIBRARY);
    url.searchParams.set('includeMetadata', 'true');
    url.searchParams.set('platform', 'Windows');
    if (cursor) url.searchParams.set('cursor', cursor);
    let page;
    try {
      page = await epicRequest(url, { headers: { Authorization: `Bearer ${activeSession.access_token}`, 'User-Agent': USER_AGENT } });
    } catch (error) {
      if (/HTTP 401|HTTP 403/.test(error.message) && !refreshedAfterUnauthorized) {
        activeSession = await refreshEpicSession(activeSession);
        await persistSession(activeSession);
        refreshedAfterUnauthorized = true;
        page = await epicRequest(url, { headers: { Authorization: `Bearer ${activeSession.access_token}`, 'User-Agent': USER_AGENT } });
      } else throw error;
    }
    if (Array.isArray(page.records)) records.push(...page.records);
    const next = page.responseMetadata?.nextCursor;
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
  } while (true);

  const catalogInfo = new Map();
  const byNamespace = new Map();
  for (const record of records) {
    const namespace = String(record?.namespace || '');
    const itemId = String(record?.catalogItemId || record?.catalog_item_id || '');
    if (!namespace || !itemId) continue;
    if (!byNamespace.has(namespace)) byNamespace.set(namespace, new Set());
    byNamespace.get(namespace).add(itemId);
  }
  await Promise.all([...byNamespace].map(async ([namespace, itemIds]) => {
    for (const batch of [...itemIds].reduce((groups, id, index) => { if (index % 40 === 0) groups.push([]); groups.at(-1).push(id); return groups; }, [])) {
      const url = new URL(`${CATALOG}/${encodeURIComponent(namespace)}/bulk/items`);
      url.searchParams.set('id', batch.join(','));
      url.searchParams.set('includeDLCDetails', 'true');
      url.searchParams.set('includeMainGameDetails', 'true');
      url.searchParams.set('country', 'ES');
      url.searchParams.set('locale', 'es-ES');
      try {
        const items = await epicRequest(url, { headers: { Authorization: `Bearer ${activeSession.access_token}`, 'User-Agent': USER_AGENT } });
        const entries = Array.isArray(items) ? items : Array.isArray(items.elements) ? items.elements : Array.isArray(items.items) ? items.items : null;
        if (entries) {
          for (const info of entries) {
            const id = String(info?.id || info?.catalogItemId || info?.catalog_item_id || '');
            if (id) catalogInfo.set(`${namespace}:${id}`, info);
          }
        } else {
          for (const [id, info] of Object.entries(items)) {
            if (info && typeof info === 'object') catalogInfo.set(`${namespace}:${id}`, info);
          }
        }
      } catch { /* Some entitlements have no catalog entry (for example, delisted games). */ }
    }
  }));

  const games = [];
  const unique = new Set();
  for (const record of records) {
    const appName = String(record?.appName || record?.app_name || '');
    const namespace = String(record?.namespace || '');
    const catalogItemId = String(record?.catalogItemId || record?.catalog_item_id || '');
    if (!appName || !namespace || !catalogItemId || unique.has(appName)) continue;
    unique.add(appName);
    if (['ue', '89efe5924d3d467c839449ab6ab52e7f'].includes(namespace) || appName === '1' || record.sandboxType === 'PRIVATE') continue;
    const platforms = Array.isArray(record.platform) ? record.platform : [];
    if (platforms.length && !platforms.some(platform => ['Windows', 'Win32'].includes(platform))) continue;
    const catalog = catalogInfo.get(`${namespace}:${catalogItemId}`) || {};
    const embeddedCatalog = record.catalogItem && typeof record.catalogItem === 'object' ? record.catalogItem : {};
    if (catalog.mainGameItem || embeddedCatalog.mainGameItem || record.isDLC || record.is_dlc) continue;
    const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
    const titleCandidates = [embeddedCatalog.title, embeddedCatalog.displayName, catalog.title, catalog.displayName, metadata.title, metadata.displayName, record.title, record.displayName]
      .map(value => String(value || '').trim())
      .filter(value => value && value.toLowerCase() !== appName.toLowerCase() && value.toLowerCase() !== catalogItemId.toLowerCase());
    const title = titleCandidates[0] || `Epic game ${appName}`;
    const keyImages = [embeddedCatalog.keyImages, catalog.keyImages, metadata.keyImages, record.keyImages].flatMap(images => Array.isArray(images) ? images : []);
    const imageTypes = ['DieselGameBoxTall', 'DieselGameBox', 'OfferImageTall', 'OfferImageWide', 'Thumbnail'];
    const image = [...imageTypes.map(type => keyImages.find(item => item?.type === type)?.url), ...keyImages.map(item => item?.url)]
      .find(url => typeof url === 'string' && /^https:\/\//i.test(url)) || '';
    games.push({
      id: `epic-account-${appName}`, title: String(title), platform: 'Epic', source: 'epic-account', sources: ['epic'], art: image,
      installed: false, launch: `com.epicgames.launcher://apps/${[namespace, catalogItemId, appName].map(encodeURIComponent).join('%3A')}?action=launch&silent=true`
    });
  }
  return games;
}

module.exports = { epicLoginUrl, connectEpic, refreshEpicSession, epicLibrary };
