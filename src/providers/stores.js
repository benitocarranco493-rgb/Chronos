const STEAM_ENDPOINT = 'https://store.steampowered.com/api/storesearch/';
const STEAM_FEATURED_ENDPOINT = 'https://store.steampowered.com/api/featuredcategories/';
const STEAM_SPOTLIGHT_ENDPOINT = 'https://store.steampowered.com/api/featured/';
const EPIC_FREE_ENDPOINT = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';
const EPIC_ENDPOINT = 'https://store.epicgames.com/graphql';

function validateEpicBrowseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid Epic search URL.'); }
  if (url.origin !== 'https://store.epicgames.com' || url.username || url.password || url.hash || url.searchParams.size !== 1 || !/^\/[a-z]{2}-[A-Z]{2}\/browse\/?$/.test(url.pathname) || !url.searchParams.get('q') || url.searchParams.get('q').length > 100) {
    throw new Error('Only Epic Games Store search pages can open inside Chronos.');
  }
  return url.toString();
}

async function requestJson(fetchImpl, url, options) {
  try {
    const response = await fetchImpl(url, options);
    if (!response.ok) return { ok: false, data: null };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, data: null };
  }
}

function formatSteam(item, region) {
  const price = item.price;
  return {
    store: 'steam', id: String(item.id), title: item.name,
    art: item.tiny_image || '',
    price: price ? { current: price.final / 100, original: price.initial / 100, discount: price.discount_percent || 0, currency: price.currency } : null,
    url: `https://store.steampowered.com/app/${encodeURIComponent(item.id)}/`, region
  };
}

function formatEpic(item, region) {
  const total = item.price?.totalPrice;
  const fmt = total?.fmtPrice;
  const slug = item.catalogNs?.mappings?.find(mapping => mapping.pageSlug && (!mapping.pageType || mapping.pageType === 'productHome'))?.pageSlug
    || item.offerMappings?.find(mapping => mapping.pageSlug)?.pageSlug || item.productSlug || item.urlSlug;
  return {
    store: 'epic', id: String(item.id), title: item.title,
    art: item.keyImages?.find(image => image.type === 'OfferImageWide')?.url || item.keyImages?.[0]?.url || '',
    price: total ? { current: total.discountPrice / 10 ** (total.currencyInfo?.decimals ?? 2), original: total.originalPrice / 10 ** (total.currencyInfo?.decimals ?? 2), discount: total.discount || 0, currency: total.currencyCode, display: fmt?.discountPrice } : null,
    url: slug ? `https://store.epicgames.com/${region.locale}/p/${slug}` : 'https://store.epicgames.com/', region
  };
}

function formatSteamFeatured(item, region) {
  const current = Number(item.final_price);
  const original = Number(item.original_price);
  return {
    store: 'steam', id: String(item.id), title: item.name || 'Unknown game',
    art: item.large_capsule_image || item.header_image || item.small_capsule_image || '',
    banner: item.large_capsule_image || item.header_image || '',
    price: Number.isFinite(current) ? { current: current / 100, original: Number.isFinite(original) ? original / 100 : current / 100, discount: Number(item.discount_percent) || 0, currency: item.currency || 'EUR' } : null,
    url: `https://store.steampowered.com/app/${encodeURIComponent(item.id)}/`, region
  };
}

function formatEpicFree(item, region, upcoming = false) {
  const result = formatEpic(item, region);
  const total = item.price?.totalPrice;
  const original = total?.originalPrice;
  const currency = total?.currencyCode || 'EUR';
  const decimals = total?.currencyInfo?.decimals ?? 2;
  const originalPrice = Number.isFinite(original) ? original / 10 ** decimals : 0;
  result.price = { current: 0, original: originalPrice, discount: upcoming ? 0 : (originalPrice ? 100 : 0), currency, display: upcoming ? 'Free soon' : 'Free' };
  result.promotion = upcoming ? 'Free soon' : 'Free for a limited time';
  result.url = result.url || 'https://store.epicgames.com/';
  return result;
}

async function browseStores({ country = 'ES', locale = 'es-ES', fetchImpl = fetch } = {}) {
  const cc = String(country).toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) throw new Error('Invalid store region.');
  const region = { country: cc, locale };
  const params = new URLSearchParams({ cc, l: locale.split('-')[0] || 'en' });
  const steamFeaturedUrl = `${STEAM_FEATURED_ENDPOINT}?${params}`;
  const steamSpotlightUrl = `${STEAM_SPOTLIGHT_ENDPOINT}?${params}`;
  const epicFreeUrl = `${EPIC_FREE_ENDPOINT}?${new URLSearchParams({ locale: 'en-US', country: cc, allowCountries: cc })}`;
  const [featured, spotlight, epicFree] = await Promise.all([
    requestJson(fetchImpl, steamFeaturedUrl),
    requestJson(fetchImpl, steamSpotlightUrl),
    requestJson(fetchImpl, epicFreeUrl)
  ]);
  const shelves = [];
  const sections = [
    ['specials', 'On Sale'], ['top_sellers', 'Top Sellers'],
    ['new_releases', 'New Releases'], ['coming_soon', 'Coming Soon']
  ];
  for (const [key, title] of sections) {
    const items = (featured.data?.[key]?.items || []).filter(item => item.type === 0 && item.name).map(item => formatSteamFeatured(item, region));
    if (items.length) shelves.push({ key, title, store: 'steam', items: items.slice(0, 18) });
  }
  const freeGames = epicFree.data?.data?.Catalog?.searchStore?.elements || [];
  const freeItems = freeGames.map(item => {
    const promotions = item.promotions || {};
    const freeNow = (promotions.promotionalOffers || []).some(group => (group.promotionalOffers || []).some(offer => (offer.discountSetting?.discountPercentage ?? 100) === 0));
    const freeLater = (promotions.upcomingPromotionalOffers || []).some(group => (group.promotionalOffers || []).some(offer => (offer.discountSetting?.discountPercentage ?? 100) === 0));
    return freeNow || freeLater ? formatEpicFree(item, region, !freeNow && freeLater) : null;
  }).filter(Boolean);
  if (freeItems.length) shelves.unshift({ key: 'free', title: 'Free for a Limited Time', store: 'epic', items: freeItems.slice(0, 12) });
  const spotlightItems = [...(spotlight.data?.large_capsules || []), ...(spotlight.data?.featured_win || [])]
    .filter((item, index, all) => item.type === 0 && item.name && all.findIndex(other => other.id === item.id) === index)
    .map(item => formatSteamFeatured(item, region)).slice(0, 10);
  const steamAvailable = featured.ok || spotlight.ok;
  const epicAvailable = epicFree.ok && !epicFree.data?.errors?.length && Array.isArray(freeGames);
  if (!steamAvailable && !epicAvailable) throw new Error('The store could not be loaded. Check your internet connection and try again.');
  return { shelves, spotlight: spotlightItems, checkedAt: Date.now(), region, providers: { steam: steamAvailable, epic: epicAvailable } };
}

async function searchStores(query, { country = 'ES', locale = 'es-ES', start = 0, fetchImpl = fetch } = {}) {
  const term = String(query || '').trim().slice(0, 100);
  if (!term) return { results: [], checkedAt: Date.now() };
  const cc = country.toUpperCase();
  const language = locale.split('-')[0];
  const region = { country: cc, locale };
  const offset = Number.isInteger(start) ? Math.max(0, Math.min(240, start)) : 0;
  const steamUrl = new URL(STEAM_ENDPOINT);
  steamUrl.search = new URLSearchParams({ term, l: language, cc, count: '12', start: String(offset) }).toString();
  const epicQuery = `query searchStore($keywords:String!,$country:String!,$locale:String!){Catalog{searchStore(count:12,country:$country,keywords:$keywords,locale:$locale,sortBy:"relevancy",sortDir:"DESC",start:${offset},withPrice:true){elements{title id productSlug urlSlug keyImages{type url} price(country:$country){totalPrice{discountPrice originalPrice discount currencyCode currencyInfo{decimals} fmtPrice(locale:$locale){discountPrice}}}}}}}`;
  const [steamResponse, firstEpicResponse] = await Promise.all([
    requestJson(fetchImpl, steamUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }),
    requestJson(fetchImpl, EPIC_ENDPOINT, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: epicQuery, variables: { keywords: term, country: cc, locale } }), signal: AbortSignal.timeout(12000) })
  ]);
  const epicQueryFailed = !firstEpicResponse.ok || Boolean(firstEpicResponse.data?.errors?.length);
  const epicResponse = epicQueryFailed
    ? await requestJson(fetchImpl, EPIC_ENDPOINT, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: epicQuery, variables: { keywords: term, country: cc, locale } }), signal: AbortSignal.timeout(12000) })
    : firstEpicResponse;
  const results = [];
  const steamAvailable = steamResponse.ok && Array.isArray(steamResponse.data?.items);
  const epicItems = epicResponse.data?.data?.Catalog?.searchStore?.elements;
  const epicAvailable = epicResponse.ok && !epicResponse.data?.errors?.length && Array.isArray(epicItems);
  if (steamAvailable) {
    for (const item of steamResponse.data.items) results.push(formatSteam(item, region));
  }
  if (epicAvailable) {
    for (const item of epicItems) results.push(formatEpic(item, region));
  }
  if (!results.length && !steamAvailable && !epicAvailable) {
    throw new Error('Store search is unavailable. Check your internet connection and try again.');
  }
  const hasMore = (steamAvailable && steamResponse.data.items.length >= 12) || (epicAvailable && epicItems.length >= 12);
  return { results, checkedAt: Date.now(), region, hasMore, providers: { steam: steamAvailable, epic: epicAvailable } };
}

module.exports = { searchStores, browseStores, formatSteam, formatEpic, formatSteamFeatured, formatEpicFree, validateEpicBrowseUrl };
