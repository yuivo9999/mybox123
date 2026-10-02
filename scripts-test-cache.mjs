import assert from 'node:assert/strict';

class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(String(key), String(value)); }
  removeItem(key) { this.#data.delete(String(key)); }
}

globalThis.window = { localStorage: new MemoryStorage() };

const { storage } = await import('./src/storage/storage.js');
const { cacheStorage, CacheNamespace, createCacheKey } = await import('./src/storage/cache.js');

storage.write('favorites', [{ favoriteId: 'favorite:content:movie-1' }]);
const key = createCacheKey({
  namespace: CacheNamespace.DETAIL,
  sourceId: 'source-a',
  contentId: 'movie-1',
  params: { kind: 'detail' },
});
cacheStorage.set(CacheNamespace.DETAIL, key, { contentId: 'movie-1' }, { ttl: 60_000 });

assert.deepEqual(cacheStorage.get(CacheNamespace.DETAIL, key).value, { contentId: 'movie-1' });
assert.equal(cacheStorage.get(CacheNamespace.MOVIE, key).hit, false);

cacheStorage.clear(CacheNamespace.DETAIL);
assert.equal(cacheStorage.get(CacheNamespace.DETAIL, key).hit, false);
assert.deepEqual(storage.read('favorites', []), [{ favoriteId: 'favorite:content:movie-1' }]);

const staleKey = createCacheKey({
  namespace: CacheNamespace.EPG,
  sourceId: 'live-a',
  contentId: 'channel-1',
  params: { startAt: '2026-10-02T00:00:00Z', endAt: '2026-10-02T01:00:00Z' },
});
cacheStorage.set(CacheNamespace.EPG, staleKey, [{ programId: 'epg-1' }], { ttl: 1 });
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal(cacheStorage.get(CacheNamespace.EPG, staleKey).hit, false);
assert.deepEqual(cacheStorage.get(CacheNamespace.EPG, staleKey, { allowStale: true }).value, [{ programId: 'epg-1' }]);

console.log('cache lifecycle smoke checks passed');
