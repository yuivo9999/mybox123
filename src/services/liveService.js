import { mergeLiveChannels } from '../adapters/live/normalizeLive.js';
import { createLiveRegistry } from '../adapters/live/liveRegistry.js';

export const liveRegistry = createLiveRegistry();

export const liveService = {
  async sync(sourceIds = null) {
    const adapters = liveRegistry.list().filter((adapter) => !sourceIds || sourceIds.includes(adapter.sourceId));
    const settled = await Promise.allSettled(adapters.map((adapter) => adapter.getChannels()));
    const channels = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    return { channels: mergeLiveChannels(channels), results: settled };
  },
  getChannels: (items = []) => mergeLiveChannels(items),
  getById: (items, channelId) => items.find((item) => item.channelId === channelId) ?? null,
  async getStreams(channelRef) {
    const adapters = liveRegistry.list().filter((adapter) => channelRef?.sourceIds?.includes(adapter.sourceId) ?? true);
    const results = await Promise.allSettled(adapters.map((adapter) => adapter.getStreams(channelRef)));
    return results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  },
  async getEPG(channelRef, range) {
    const adapters = liveRegistry.list().filter((adapter) => channelRef?.sourceIds?.includes(adapter.sourceId) ?? true);
    const results = await Promise.allSettled(adapters.map((adapter) => adapter.getEPG(channelRef, range)));
    return results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  },
  async healthCheck() {
    const results = await Promise.allSettled(liveRegistry.list().map((adapter) => adapter.healthCheck()));
    return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  },
};
