import { mergeLiveChannels } from '../adapters/live/normalizeLive.js';
import { createLiveRegistry } from '../adapters/live/liveRegistry.js';

export const liveRegistry = createLiveRegistry();

const epgCache = new Map();

function normalizeRange(range = {}) {
  return {
    startAt: range.startAt ?? null,
    endAt: range.endAt ?? null,
  };
}

function epgCacheKey(channelRef, range) {
  const normalized = normalizeRange(range);
  return [
    channelRef?.channelId ?? '',
    normalized.startAt ?? '',
    normalized.endAt ?? '',
  ].join('|');
}

export const liveService = {
  async sync(sourceIds = null) {
    const adapters = liveRegistry.list().filter((adapter) => !sourceIds || sourceIds.includes(adapter.sourceId));
    const settled = await Promise.allSettled(adapters.map((adapter) => adapter.getChannels()));
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
    const adapters = liveRegistry.list().filter((adapter) => channelRef?.sourceRefs?.some((ref) => ref.sourceId === adapter.sourceId));
    const results = await Promise.allSettled(adapters.map((adapter) => adapter.getStreams(channelRef)));
    const streams = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    return streams.length ? streams : (channelRef?.streams ?? []);
  },

  async getEPG(channelRef, range = {}) {
    const key = epgCacheKey(channelRef, range);
    if (epgCache.has(key)) return epgCache.get(key);

    const adapters = liveRegistry.list().filter((adapter) =>
      channelRef?.sourceRefs?.some((ref) => ref.sourceId === adapter.sourceId),
    );
    const results = await Promise.allSettled(adapters.map((adapter) => adapter.getEPG(channelRef, range)));
    const epg = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);

    // Existing normalized EPG acts as a non-blocking cache/fallback.
    const fallback = channelRef?.epg ?? [];
    const value = epg.length ? epg : fallback;
    epgCache.set(key, value);
    return value;
  },

  clearEPGCache() {
    epgCache.clear();
  },

  async healthCheck() {
    const results = await Promise.allSettled(liveRegistry.list().map((adapter) => adapter.healthCheck()));
    return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  },
};
