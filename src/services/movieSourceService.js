import { createMovieRegistry } from '../adapters/movie/movieRegistry.js';
import { createMovieAdapter } from '../adapters/movie/movieAdapter.js';
import { contentService } from './contentService.js';
import { cacheStorage, CacheNamespace, createCacheKey } from '../storage/cache.js';
import { requestManager } from './requestManager.js';
import { errorService } from './errorService.js';

export const movieRegistry = createMovieRegistry();

/**
 * Movie adapter dispatch boundary.
 *
 * Only standard HTTP VOD sources are allowed into the generic HTTP adapter.
 * TVBox CSP/Drpy/ext/JAR-provider sources must stay out of this path unless
 * a dedicated executor is explicitly implemented later.
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
  sourceConfigs
    .filter(source =>
      source.enabled !== false
      && source.sourceType === 'movie'
      && source.sourceId === selectedSourceId
      && canUseHttpMovieAdapter(source)
      && (source.sourceRef || source.url)
    )
    .forEach(source => {
      movieRegistry.register(createMovieAdapter({
        ...source,
        sourceRef: source.sourceRef || source.url,
      }));
    });

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
    results: settled,
  };
}
