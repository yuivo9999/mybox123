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
  const key = createCacheKey({ namespace: CacheNamespace.DETAIL, sourceId: sourceIdentity([movie]), contentId: movie.contentId, params: { kind: 'detail' } });
  const cached = cacheStorage.get(CacheNamespace.DETAIL, key, { allowStale: true });
  if (cached.hit && !cached.stale) return cached.value;
  cacheStorage.set(CacheNamespace.DETAIL, key, movie); return movie;
}
function normalizeText(value) { return String(value ?? '').trim().toLowerCase(); }
function applyFilters(items, filters = {}) {
  return items.filter((movie) => {
    if (filters.year && String(movie.year) !== String(filters.year)) return false;
    if (filters.type && filters.type !== '全部' && movie.category !== filters.type) return false;
    return true;
  });
}
function sortItems(items, sort = 'default') {
  return [...items].sort((a, b) => {
    if (sort === 'latest') return Number(b.year || 0) - Number(a.year || 0) || String(b.title).localeCompare(String(a.title));
    if (sort === 'title') return String(a.title).localeCompare(String(b.title), 'zh-Hans');
    return 0;
  });
}
export const movieService = {
  list({ movies = [], category = '全部', page = 1, pageSize = 50, filters = {}, sort = 'default' } = {}) {
    const safePage = Math.max(1, Number(page) || 1), safePageSize = Math.max(1, Number(pageSize) || 50);
    const key = createCacheKey({ namespace: CacheNamespace.MOVIE, sourceId: sourceIdentity(movies), contentId: 'list', params: { category, page: safePage, pageSize: safePageSize, filters, sort } });
    const cached = cacheStorage.get(CacheNamespace.MOVIE, key, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value;
    let filtered = movies.filter((movie) => category === '全部' || movie.category === category || (category === '电视剧' && movie.episodes?.length > 1));
    filtered = sortItems(applyFilters(filtered, filters), sort);
    const start = (safePage - 1) * safePageSize;
    const value = { items: filtered.slice(start, start + safePageSize), page: safePage, pageSize: safePageSize, total: filtered.length, hasMore: start + safePageSize < filtered.length };
    cacheStorage.set(CacheNamespace.MOVIE, key, value); return value;
  },
  search({ movies = [], keyword = '' } = {}) {
    const clean = normalizeText(keyword); if (!clean) return [];
    const key = createCacheKey({ namespace: CacheNamespace.MOVIE, sourceId: sourceIdentity(movies), contentId: 'search', params: { keyword: clean } });
    const cached = cacheStorage.get(CacheNamespace.MOVIE, key, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value;
    const value = movies.filter((movie) => normalizeText(movie.title).includes(clean) || normalizeText(movie.description).includes(clean) || normalizeText(movie.category).includes(clean));
    cacheStorage.set(CacheNamespace.MOVIE, key, value); return value;
  },
  getDetail({ movies = [], contentId } = {}) { return cachedDetail(movies, contentId); },
  getEpisode({ movies = [], contentId, episodeId } = {}) {
    const content = cachedDetail(movies, contentId); if (!content) return null;
    const key = createCacheKey({ namespace: CacheNamespace.EPISODE, sourceId: sourceIdentity([content]), contentId: content.contentId, params: { episodeId: episodeId ?? '' } });
    const cached = cacheStorage.get(CacheNamespace.EPISODE, key, { allowStale: true });
    if (cached.hit && !cached.stale) return cached.value;
    const value = content.episodes?.find((episode) => episode.episodeId === episodeId) ?? null;
    if (value) cacheStorage.set(CacheNamespace.EPISODE, key, value); return value;
  },
  getRelated({ movies = [], movie, limit = 6 } = {}) {
    if (!movie) return [];
    return movies.filter((item) => item.contentId !== movie.contentId && item.category === movie.category).slice(0, limit);
  },
  getHome({ movies = [], history = [], limit = 4 } = {}) {
    const continueWatching = history.map((item) => {
      const movie = cachedDetail(movies, item.targetId); if (!movie) return null;
      const episodeIndex = Math.max(0, movie.episodes?.findIndex((episode) => episode.episodeId === item.episodeId) ?? 0);
      return { movie, episodeIndex, history: item };
    }).filter(Boolean).slice(0, limit);
    return { continueWatching, recommended: movies.slice(0, limit), popular: movies.slice(0, limit), latest: [...movies].sort((a,b)=>Number(b.year||0)-Number(a.year||0)).slice(0, limit), categories: [...new Set(movies.map((movie)=>movie.category).filter(Boolean))] };
  },
  clearCache() { cacheStorage.clear(CacheNamespace.MOVIE); cacheStorage.clear(CacheNamespace.DETAIL); cacheStorage.clear(CacheNamespace.EPISODE); },
};
