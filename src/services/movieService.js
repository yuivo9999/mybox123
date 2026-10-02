import { contentService } from './contentService.js';

export const movieService = {
  list({ movies = [], category = '全部', page = 1, pageSize = 50 } = {}) {
    const filtered = movies.filter((movie) => (
      category === '全部'
      || movie.category === category
      || (category === '电视剧' && movie.episodes?.length > 1)
    ));
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.max(1, Number(pageSize) || 50);
    const start = (safePage - 1) * safePageSize;
    return {
      items: filtered.slice(start, start + safePageSize),
      page: safePage,
      pageSize: safePageSize,
      total: filtered.length,
      hasMore: start + safePageSize < filtered.length,
    };
  },

  search({ movies = [], keyword = '' } = {}) {
    const clean = String(keyword ?? '').trim().toLowerCase();
    if (!clean) return [];
    return movies.filter((movie) => (
      String(movie.title ?? '').toLowerCase().includes(clean)
      || String(movie.description ?? '').toLowerCase().includes(clean)
      || String(movie.category ?? '').toLowerCase().includes(clean)
    ));
  },

  getDetail({ movies = [], contentId } = {}) {
    return contentService.getById(movies, contentId);
  },

  getEpisode({ movies = [], contentId, episodeId } = {}) {
    const content = this.getDetail({ movies, contentId });
    return content?.episodes?.find((episode) => episode.episodeId === episodeId) ?? null;
  },

  getHome({ movies = [], history = [], limit = 4 } = {}) {
    const continueWatching = history
      .map((item) => {
        const movie = this.getDetail({ movies, contentId: item.targetId });
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
};
