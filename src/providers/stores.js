const STEAM_ENDPOINT = 'https://store.steampowered.com/api/storesearch/';
const EPIC_ENDPOINT = 'https://store.epicgames.com/graphql';

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
  const slug = item.productSlug || item.urlSlug;
  return {
    store: 'epic', id: String(item.id), title: item.title,
    art: item.keyImages?.find(image => image.type === 'OfferImageWide')?.url || item.keyImages?.[0]?.url || '',
    price: total ? { current: total.discountPrice / 10 ** (total.currencyInfo?.decimals ?? 2), original: total.originalPrice / 10 ** (total.currencyInfo?.decimals ?? 2), discount: total.discount || 0, currency: total.currencyCode, display: fmt?.discountPrice } : null,
    url: slug ? `https://store.epicgames.com/${region.locale}/p/${slug}` : 'https://store.epicgames.com/', region
  };
}

async function searchStores(query, { country = 'ES', locale = 'es-ES', fetchImpl = fetch } = {}) {
  const term = String(query || '').trim().slice(0, 100);
  if (!term) return { results: [], checkedAt: Date.now() };
  const cc = country.toUpperCase();
  const language = locale.split('-')[0];
  const region = { country: cc, locale };
  const steamUrl = new URL(STEAM_ENDPOINT);
  steamUrl.search = new URLSearchParams({ term, l: language, cc }).toString();
  const epicQuery = `query searchStore($keywords:String!,$country:String!,$locale:String!){Catalog{searchStore(count:12,country:$country,keywords:$keywords,locale:$locale,sortBy:"relevancy",sortDir:"DESC",start:0,withPrice:true){elements{title id productSlug urlSlug keyImages{type url} price(country:$country){totalPrice{discountPrice originalPrice discount currencyCode currencyInfo{decimals} fmtPrice(locale:$locale){discountPrice}}}}}}}`;
  const [steamResponse, epicResponse] = await Promise.all([
    requestJson(fetchImpl, steamUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }),
    requestJson(fetchImpl, EPIC_ENDPOINT, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: epicQuery, variables: { keywords: term, country: cc, locale } }), signal: AbortSignal.timeout(12000) })
  ]);
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
  return { results, checkedAt: Date.now(), region, providers: { steam: steamAvailable, epic: epicAvailable } };
}

module.exports = { searchStores, formatSteam, formatEpic };
