import { liveRegistry } from './liveService.js';
import { syncMovieSources } from './movieSourceService.js';
import { createLiveAdapter } from '../adapters/live/liveAdapter.js';

function normalizeSource(source) {
  if (!source?.sourceId) throw new Error('SOURCE_ID_REQUIRED');
  return { ...source, sourceRef: source.sourceRef || source.url };
}

export const sourceRegistryService = {
  clear() {
    liveRegistry.clear();
  },

  registerLiveSource(source, transport = null) {
    const normalized = normalizeSource(source);
    const adapter = createLiveAdapter(normalized, transport);
    liveRegistry.register(adapter);
    return adapter;
  },

  async testLiveSource(source, options = {}) {
    const normalized = normalizeSource(source);
    const adapter = createLiveAdapter(normalized, options.transport);
    return adapter.healthCheck(options);
  },

  async syncMovieSources(sources) {
    return syncMovieSources(sources);
  },

  async registerAll(sources) {
    this.clear();
    for (const source of sources.filter(item => item.sourceType === 'live' && item.enabled !== false && (item.sourceRef || item.url))) {
      this.registerLiveSource(source);
    }
    return { movie: true, live: true };
  },
};
