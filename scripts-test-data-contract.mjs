import assert from 'node:assert/strict';

class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(String(key), String(value)); }
  removeItem(key) { this.#data.delete(String(key)); }
  clear() { this.#data.clear(); }
}

globalThis.window = { localStorage: new MemoryStorage() };

const { createContentId, createEpisodeId, normalizeContent } = await import('./src/models/content.js');
const { createChannelId, createStreamId, normalizeChannel } = await import('./src/models/live.js');
const { storage } = await import('./src/storage/storage.js');
const { cacheStorage, CacheNamespace, createCacheKey } = await import('./src/storage/cache.js');

const content = normalizeContent({
  sourceId: 'source-a',
  sourceItemId: 'movie-1',
  title: 'Demo',
  type: 'movie',
  episodes: [{ title: '正片', sourceItemId: 'episode-1' }],
});

assert.equal(content.contentId, createContentId('source-a', 'movie-1'));
assert.equal(content.episodes[0].episodeId, createEpisodeId(content.contentId, 'source-a', 'episode-1'));
assert.equal(content.episodes[0].sourceRefs[0].sourceId, 'source-a');
assert.equal(content.description, '');
assert.deepEqual(content.actors, []);

const channel = normalizeChannel({
  sourceId: 'live-a',
  sourceItemId: 'news',
  name: 'News',
  category: '新闻',
  streams: [{ url: 'https://example.com/news.m3u8' }],
});

assert.equal(channel.channelId, createChannelId('live-a', 'news'));
assert.equal(channel.streams[0].streamId, createStreamId('live-a', 'news', 0));
assert.equal(channel.streams[0].protocol, 'hls');
assert.equal(channel.sourceRefs[0].sourceChannelId, 'source-channel:live-a:news');

const favorites = [{ favoriteId: 'favorite:content:movie-1' }];
storage.write('favorites', favorites);
storage.write('settings', { theme: 'system' });
assert.deepEqual(storage.read('favorites', []), favorites);
assert.deepEqual(storage.read('settings', {}), { theme: 'system' });

const detailKey = createCacheKey({
  namespace: CacheNamespace.DETAIL,
  sourceId: 'source-a',
  contentId: content.contentId,
  params: { kind: 'detail', page: 1 },
});
cacheStorage.set(CacheNamespace.DETAIL, detailKey, { contentId: content.contentId }, { ttl: 60_000 });
assert.equal(cacheStorage.get(CacheNamespace.DETAIL, detailKey).hit, true);
cacheStorage.clear(CacheNamespace.DETAIL);
assert.equal(cacheStorage.get(CacheNamespace.DETAIL, detailKey).hit, false);
assert.deepEqual(storage.read('favorites', []), favorites);

const reorderedKey = createCacheKey({
  namespace: CacheNamespace.DETAIL,
  sourceId: 'source-a',
  contentId: content.contentId,
  params: { page: 1, kind: 'detail' },
});
assert.equal(reorderedKey, detailKey);

console.log('Data model, identity, persistence and cache-boundary tests passed');
