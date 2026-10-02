import { contentService } from './contentService.js';
import { cacheStorage, CacheNamespace, createCacheKey } from '../storage/cache.js';

function sourceIdentity(movies = []) {
  const sourceIds = new Set();
  movies.forEach((movie) => (movie.sourceRefs ?? []).forEach((ref) => ref?.sourceId && sourceIds.add(ref.sourceId)));
  return [...sourceIds].sort().join(',') || 'aggregate';
}

function cachedDetail(movies, contentId) {
  const movie = contentService.getById(movies, contentId);
  if (!movie) return null;
  const key = createCacheKey({
    namespace: CacheNamespace.DETAIL,
    sourceId: sourceIdentity([movie]),
    contentId: movie.contentId,
    params: { kind: 'detail' },
  });
  const cached = cacheStorage.get(CacheNamespace.DETAIL, key, { allowStale: true });
  if (cached.hit && !cached.stale) return cached.value;
  cacheStorage.set(CacheNamespace.DETAIL, key, movie);
  return movie;
}

export const movieService = {
  list({ movies = [], category = '全部', page = 1, pageSize = 50 } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.max(1, Number(pageSize) || 50);
    const key = createCacheKey({
      namespace: CacheNamespace.MOVIE,
      sourceId: sourceIdentity(movies),
      contentId: 'list',
      params: { category, page: safePage, pageSize: safePageSize },
    });
    const cached = cacheStorage.get(CacheNamespace.MOVIE, key, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value;

    const filtered = movies.filter((movie) => (
      category === '全部'
      || movie.category === category
      || (category === '电视剧' && movie.episodes?.length > 1)
    ));
    const start = (safePage - 1) * safePageSize;
    const value = {
      items: filtered.slice(start, start + safePageSize),
      page: safePage,
      pageSize: safePageSize,
      total: filtered.length,
      hasMore: start + safePageSize < filtered.length,
    };
    cacheStorage.set(CacheNamespace.MOVIE, key, value);
    return value;
  },

  search({ movies = [], keyword = '' } = {}) {
    const clean = String(keyword ?? '').trim().toLowerCase();
    if (!clean) return [];
    const key = createCacheKey({
      namespace: CacheNamespace.MOVIE,
      sourceId: sourceIdentity(movies),
      contentId: 'search',
      params: { keyword: clean },
    });
    const cached = cacheStorage.get(CacheNamespace.MOVIE, key, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value;

    const value = movies.filter((movie) => (
      String(movie.title ?? '').toLowerCase().includes(clean)
      || String(movie.description ?? '').toLowerCase().includes(clean)
      || String(movie.category ?? '').toLowerCase().includes(clean)
    ));
    cacheStorage.set(CacheNamespace.MOVIE, key, value);
    return value;
  },

  getDetail({ movies = [], contentId } = {}) {
    return cachedDetail(movies, contentId);
  },

  getEpisode({ movies = [], contentId, episodeId } = {}) {
    const content = cachedDetail(movies, contentId);
    if (!content) return null;
    const key = createCacheKey({
      namespace: CacheNamespace.EPISODE,
      sourceId: sourceIdentity([content]),
      contentId: content.contentId,
      params: { episodeId: episodeId ?? '' },
    });
    const cached = cacheStorage.get(CacheNamespace.EPISODE, key, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value;
    const value = content.episodes?.find((episode) => episode.episodeId === episodeId) ?? null;
    if (value) cacheStorage.set(CacheNamespace.EPISODE, key, value);
    return value;
  },

  getHome({ movies = [], history = [], limit = 4 } = {}) {
    const continueWatching = history
      .map((item) => {
        const movie = cachedDetail(movies, item.targetId);
        if (!movie) return null;
        const episodeIndex = Math.max(
          0,
          movie.episodes?.findIndex((episode) => episode.episodeId === item.episodeId) ?? 0,
        );
        return { movie, episodeIndex, history: item };
      })
      .filter(Boolean)
      .slice(0, limit);

    return {
      continueWatching,
      popular: movies.slice(0, limit),
      latest: movies.slice(0, limit),
    };
  },

  clearCache() {
    cacheStorage.clear(CacheNamespace.MOVIE);
    cacheStorage.clear(CacheNamespace.DETAIL);
    cacheStorage.clear(CacheNamespace.EPISODE);
  },
};
