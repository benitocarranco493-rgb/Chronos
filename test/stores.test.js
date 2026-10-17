const test = require('node:test');
const assert = require('node:assert/strict');
const { searchStores, validateEpicBrowseUrl } = require('../src/providers/stores');

test('Epic fallback URL accepts only official localized browse pages with a query', () => {
  assert.equal(validateEpicBrowseUrl('https://store.epicgames.com/es-ES/browse/?q=Hades'), 'https://store.epicgames.com/es-ES/browse/?q=Hades');
  assert.throws(() => validateEpicBrowseUrl('https://example.com/es-ES/browse/?q=Hades'), /Only Epic Games Store/);
  assert.throws(() => validateEpicBrowseUrl('https://store.epicgames.com:444/es-ES/browse/?q=Hades'), /Only Epic Games Store/);
  assert.throws(() => validateEpicBrowseUrl('https://store.epicgames.com/es-ES/browse/'), /Only Epic Games Store/);
});

test('store search normalizes regional Steam and Epic prices independently', async () => {
  const responses = [
    { ok: true, json: async () => ({ items: [{ id: 1, name: 'Example', tiny_image: 'https://img', price: { currency: 'EUR', final: 799, initial: 999, discount_percent: 20 } }] }) },
    { ok: true, json: async () => ({ data: { Catalog: { searchStore: { elements: [{ id: 'abc', title: 'Example Epic', productSlug: 'example', price: { totalPrice: { discountPrice: 0, originalPrice: 0, discount: 0, currencyCode: 'EUR', currencyInfo: { decimals: 2 }, fmtPrice: { discountPrice: 'Free' } } } }] } } } }) }
  ];
  const result = await searchStores('Example', { country: 'ES', locale: 'es-ES', fetchImpl: async () => responses.shift() });
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].price.current, 7.99);
  assert.equal(result.results[0].price.discount, 20);
  assert.equal(result.results[1].price.display, 'Free');
  assert.deepEqual(result.region, { country: 'ES', locale: 'es-ES' });
});

test('store search returns an available provider when the other is down', async () => {
  const responses = [{ ok: true, json: async () => ({ items: [{ id: 5, name: 'Only Steam' }] }) }, { ok: false }];
  const result = await searchStores('Only Steam', { fetchImpl: async () => responses.shift() });
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.providers, { steam: true, epic: false });
});

test('store search keeps valid results when the other provider returns invalid JSON', async () => {
  const responses = [
    { ok: true, json: async () => ({ items: [{ id: 9, name: 'Valid Steam result' }] }) },
    { ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }
  ];
  const result = await searchStores('Valid Steam result', { fetchImpl: async () => responses.shift() });
  assert.equal(result.results[0].title, 'Valid Steam result');
  assert.deepEqual(result.providers, { steam: true, epic: false });
});

test('store search treats GraphQL errors as an unavailable Epic provider', async () => {
  const responses = [
    { ok: true, json: async () => ({ items: [] }) },
    { ok: true, json: async () => ({ errors: [{ message: 'catalog unavailable' }] }) }
  ];
  const result = await searchStores('Missing title', { fetchImpl: async () => responses.shift() });
  assert.deepEqual(result.providers, { steam: true, epic: false });
  assert.equal(result.results.length, 0);
});
