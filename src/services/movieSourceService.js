import { createMovieRegistry } from '../adapters/movie/movieRegistry.js';
import { createMovieAdapter } from '../adapters/movie/movieAdapter.js';
import { createSourceAdapter } from '../adapters/sourceAdapterFactory.js';
import { contentService } from './contentService.js';
import { cacheStorage, CacheNamespace, createCacheKey } from '../storage/cache.js';
import { requestManager } from './requestManager.js';
import { errorService } from './errorService.js';

export const movieRegistry = createMovieRegistry();

/**
 * Movie adapter dispatch boundary.
 *
 * Only standard HTTP VOD sources are allowed into the generic HTTP adapter.
 * TVBox extension sources stay out of the generic HTTP adapter path.
 * Dedicated adapters are created through sourceAdapterFactory.
 *
 * Local/user-created movie sources do not carry sourceCapability, so they
 * continue to use the existing generic adapter path.
 */
export function canUseHttpMovieAdapter(source = {}) {
  const capability = String(source.sourceCapability || '').trim();
  const adapterType = String(source.adapterType || '').trim();

  if (capability.startsWith('tvbox-') || adapterType.startsWith('tvbox-')) return false;
  if (!capability && !adapterType) return true;

  return capability === 'direct-http-vod' && adapterType === 'http-vod';
}

function cacheKey(sourceId) {
  return createCacheKey({
    namespace: CacheNamespace.SOURCE,
    sourceId,
    contentId: 'movies',
    params: { type: 'movies' },
  });
}

async function load(adapter) {
  const key = cacheKey(adapter.sourceId);
  const cached = cacheStorage.get(CacheNamespace.SOURCE, key, { allowStale: true });
  if (cached.hit && !cached.stale) return { value: cached.value, stale: false, fromCache: true };

  try {
    const value = await requestManager.run(
      `movie:source:${adapter.sourceId}`,
      signal => adapter.getMovies({ signal }),
    );

    if (Array.isArray(value) && value.length) {
      cacheStorage.set(CacheNamespace.SOURCE, key, value);
      return { value, stale: false };
    }

    if (cached.hit) return { value: cached.value, stale: true };
    return { value: [], stale: false };
  } catch (error) {
    if (cached.hit) {
      return {
        value: cached.value,
        stale: true,
        error: errorService.classifySource(error, {
          scope: 'movie-source-cache-fallback',
          sourceId: adapter.sourceId,
        }),
      };
    }
    throw error;
  }
}

export async function testMovieSource(source, options = {}) {
  const adapter = createMovieAdapter({
    ...source,
    sourceRef: source?.sourceRef || source?.url,
  }, options.transport);

  return adapter.healthCheck({ signal: options.signal });
}

export async function syncMovieSources(sourceConfigs = [], selectedSourceId = null) {
  movieRegistry.clear();

  // 影视源采用按需加载：没有明确选择时不请求任何影视源。
  const selected = sourceConfigs.filter(source =>
    source.enabled !== false
    && source.sourceType === 'movie'
    && source.sourceId === selectedSourceId
  );

  const adapters = [];
  const unsupported = [];
  selected.forEach(source => {
    try {
      if (canUseHttpMovieAdapter(source)) {
        adapters.push(createMovieAdapter({
          ...source,
          sourceRef: source.sourceRef || source.url,
        }));
      } else {
        adapters.push(createSourceAdapter(source));
      }
    } catch (error) {
      unsupported.push({
        sourceId: source.sourceId,
        name: source.name || '',
        adapterType: source.adapterType || null,
        sourceCapability: source.sourceCapability || null,
        error,
      });
    }
  });

  adapters.forEach(adapter => movieRegistry.register(adapter));

  const settled = await Promise.all(movieRegistry.list().map(async adapter => {
    try {
      const result = await load(adapter);
      return {
        status: 'fulfilled',
        sourceId: adapter.sourceId,
        value: result.value,
        stale: result.stale,
        capabilities: adapter.getCapabilities(),
        definition: adapter.getDefinition(),
        adapterStatus: adapter.getStatus(),
      };
    } catch (reason) {
      return {
        status: 'rejected',
        sourceId: adapter.sourceId,
        reason: errorService.classifySource(reason, {
          scope: 'movie-source',
          sourceId: adapter.sourceId,
        }),
        capabilities: adapter.getCapabilities(),
        definition: adapter.getDefinition(),
        adapterStatus: adapter.getStatus(),
      };
    }
  }));

  return {
    movies: contentService.getMovies(
      settled.flatMap(result => result.status === 'fulfilled' ? result.value : []),
    ),
    results: [...settled, ...unsupported.map(item => ({
      status: 'rejected',
      ...item,
    }))],
  };
}

export async function searchMovieSources(sourceConfigs = [], keyword = '', options = {}) {
  const query = String(keyword ?? '').trim();
  if (!query) return { query: '', results: [], failed: [] };

  const candidates = sourceConfigs.filter(source =>
    source?.sourceType === 'movie'
    && source?.enabled !== false
  );
  const concurrency = Math.max(1, Math.min(6, Number(options.concurrency) || 4));
  const pageSize = Math.max(1, Math.min(20, Number(options.pageSize) || 12));
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 4500);
  const results = [];
  const failed = [];
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor++;
      const source = candidates[index];
      try {
        const adapter = createSourceAdapter({
          ...source,
          sourceRef: source.sourceRef || source.url,
        }, options);
        if (typeof adapter.search !== 'function') throw new Error('MOVIE_SOURCE_SEARCH_UNSUPPORTED');

        const response = await adapter.search(
          { query, page: 1, pageSize },
          { signal: options.signal, timeoutMs },
        );
        const items = Array.isArray(response?.items) ? response.items : [];
        results.push({
          sourceId: source.sourceId,
          sourceName: source.name || source.sourceId,
          status: 'fulfilled',
          items,
        });
      } catch (error) {
        failed.push({
          sourceId: source.sourceId,
          sourceName: source.name || source.sourceId,
          status: 'rejected',
          reason: errorService.classifySource(error, {
            scope: 'movie-source-search',
            sourceId: source.sourceId,
          }),
        });
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, candidates.length) },
    worker,
  ));

  const order = new Map(candidates.map((source, index) => [source.sourceId, index]));
  results.sort((a, b) => (order.get(a.sourceId) ?? 0) - (order.get(b.sourceId) ?? 0));

  return { query, results, failed };
}
