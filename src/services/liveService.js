import { mergeLiveChannels } from '../adapters/live/normalizeLive.js';
import { createLiveRegistry } from '../adapters/live/liveRegistry.js';
import { cacheStorage, CacheNamespace, createCacheKey } from '../storage/cache.js';

export const liveRegistry = createLiveRegistry();

function normalizeRange(range = {}) {
  return {
    startAt: range.startAt ?? null,
    endAt: range.endAt ?? null,
  };
}

function filterEPG(programs = [], range = {}) {
  return programs.filter((program) =>
    (!range.startAt || program.endAt >= range.startAt) &&
    (!range.endAt || program.startAt <= range.endAt)
  );
}

function sourceCacheKey(sourceId) {
  return createCacheKey({
    namespace: CacheNamespace.SOURCE,
    sourceId,
    contentId: 'live-channels',
    params: { type: 'channels' },
  });
}

function liveChannelCacheKey(channelRef) {
  const sourceId = channelRef?.sourceRefs?.map((ref) => ref.sourceId).sort().join(',') || 'aggregate';
  return createCacheKey({
    namespace: CacheNamespace.LIVE_CHANNEL,
    sourceId,
    contentId: channelRef?.channelId ?? '',
    params: { sourceItems: channelRef?.sourceRefs ?? [] },
  });
}

function epgCacheKey(channelRef, range) {
  const normalized = normalizeRange(range);
  const sourceId = channelRef?.sourceRefs?.map((ref) => ref.sourceId).sort().join(',') || 'aggregate';
  return createCacheKey({
    namespace: CacheNamespace.EPG,
    sourceId,
    contentId: channelRef?.channelId ?? '',
    params: normalized,
  });
}

async function loadSourceChannels(adapter) {
  const key = sourceCacheKey(adapter.sourceId);
  const cached = cacheStorage.get(CacheNamespace.SOURCE, key, { allowStale: true });
  if (cached.hit && !cached.stale) {
    return { value: cached.value, cached: true };
  }

  try {
    const value = await adapter.getChannels();
    if (Array.isArray(value) && value.length) {
      cacheStorage.set(CacheNamespace.SOURCE, key, value);
      return { value, cached: false };
    }
    if (cached.hit) return { value: cached.value, cached: true, stale: true };
    return { value: [], cached: false };
  } catch (error) {
    if (cached.hit) return { value: cached.value, cached: true, stale: true, error };
    throw error;
  }
}

export const liveService = {
  async sync(sourceIds = null) {
    const adapters = liveRegistry.list().filter((adapter) => !sourceIds || sourceIds.includes(adapter.sourceId));
    const settled = await Promise.all(adapters.map(async (adapter) => {
      try {
        const loaded = await loadSourceChannels(adapter);
        return { status: 'fulfilled', value: loaded.value, sourceId: adapter.sourceId, cached: loaded.cached, stale: loaded.stale ?? false };
      } catch (reason) {
        return { status: 'rejected', reason, sourceId: adapter.sourceId };
      }
    }));
    const channels = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    return { channels: mergeLiveChannels(channels), results: settled };
  },

  getChannels: (items = []) => mergeLiveChannels(items),

  getCategories: (items = []) => [
    '全部',
    ...new Set(items.map((channel) => channel.category).filter(Boolean)),
  ],

  listChannels: (items = [], { category = '全部' } = {}) => {
    const channels = mergeLiveChannels(items);
    return category && category !== '全部'
      ? channels.filter((channel) => channel.category === category)
      : channels;
  },

  getById: (items, channelId) => items.find((item) => item.channelId === channelId) ?? null,

  async getStreams(channelRef) {
    const cacheKey = liveChannelCacheKey(channelRef);
    const cached = cacheStorage.get(CacheNamespace.LIVE_CHANNEL, cacheKey, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value?.streams ?? [];

    const adapters = liveRegistry.list().filter((adapter) => channelRef?.sourceRefs?.some((ref) => ref.sourceId === adapter.sourceId));
    const results = await Promise.allSettled(adapters.map((adapter) => adapter.getStreams(channelRef)));
    const streams = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    if (streams.length) {
      cacheStorage.set(CacheNamespace.LIVE_CHANNEL, cacheKey, { streams });
      return streams;
    }
    if (cached.hit) return cached.value?.streams ?? [];
    return channelRef?.streams ?? [];
  },

  async getEPG(channelRef, range = {}) {
    const normalizedRange = normalizeRange(range);
    const key = epgCacheKey(channelRef, normalizedRange);
    const cached = cacheStorage.get(CacheNamespace.EPG, key, { allowStale: true });

    if (cached.hit && !cached.stale) return cached.value;

    const adapters = liveRegistry.list().filter((adapter) =>
      channelRef?.sourceRefs?.some((ref) => ref.sourceId === adapter.sourceId),
    );
    const results = await Promise.allSettled(adapters.map((adapter) => adapter.getEPG(channelRef, normalizedRange)));
    const epg = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    if (epg.length) {
      cacheStorage.set(CacheNamespace.EPG, key, epg);
      return epg;
    }

    // Refresh failure/empty response never overwrites a usable stale value.
    if (cached.hit) return cached.value;

    return filterEPG(channelRef?.epg ?? [], normalizedRange);
  },

  clearEPGCache() {
    cacheStorage.clear(CacheNamespace.EPG);
  },

  clearCache() {
    cacheStorage.clear(CacheNamespace.SOURCE);
    cacheStorage.clear(CacheNamespace.LIVE_CHANNEL);
    cacheStorage.clear(CacheNamespace.EPG);
  },

  async healthCheck() {
    const results = await Promise.allSettled(liveRegistry.list().map((adapter) => adapter.healthCheck()));
    return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  },
};
