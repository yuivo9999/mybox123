import { createMovieRegistry } from '../adapters/movie/movieRegistry.js';
import { createMovieAdapter } from '../adapters/movie/movieAdapter.js';
import { contentService } from './contentService.js';
import { cacheStorage, CacheNamespace, createCacheKey } from '../storage/cache.js';
import { requestManager } from './requestManager.js';
import { errorService } from './errorService.js';

export const movieRegistry = createMovieRegistry();

function cacheKey(sourceId) {
  return createCacheKey({ namespace: CacheNamespace.SOURCE, sourceId, contentId: 'movies', params: { type: 'movies' } });
}

async function load(adapter) {
  const key = cacheKey(adapter.sourceId);
  const cached = cacheStorage.get(CacheNamespace.SOURCE, key, { allowStale: true });
  try {
    const value = await requestManager.run(`movie:source:${adapter.sourceId}`, signal => adapter.getMovies({ signal }));
    if (Array.isArray(value) && value.length) {
      cacheStorage.set(CacheNamespace.SOURCE, key, value);
      return { value, stale: false };
    }
    if (cached.hit) return { value: cached.value, stale: true };
    return { value: [], stale: false };
  } catch (error) {
    if (cached.hit) return { value: cached.value, stale: true, error };
    throw error;
  }
}

export async function syncMovieSources(sourceConfigs = []) {
  movieRegistry.clear();
  sourceConfigs.filter(source => source.enabled !== false && source.sourceType === 'movie' && (source.sourceRef || source.url)).forEach(source => {
    movieRegistry.register(createMovieAdapter({ ...source, sourceRef: source.sourceRef || source.url }));
  });
  const settled = await Promise.all(movieRegistry.list().map(async adapter => {
    try {
      const result = await load(adapter);
      return { status: 'fulfilled', sourceId: adapter.sourceId, value: result.value, stale: result.stale };
    } catch (reason) {
      return { status: 'rejected', sourceId: adapter.sourceId, reason: errorService.classifySource(reason, { scope: 'movie-source', sourceId: adapter.sourceId }) };
    }
  }));
  return {
    movies: contentService.getMovies(settled.flatMap(result => result.status === 'fulfilled' ? result.value : [])),
    results: settled,
  };
}
