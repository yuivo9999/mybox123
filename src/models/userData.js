export function createFavoriteId(targetType, targetId) {
  return `favorite:${targetType}:${targetId}`;
}

export function createHistoryId(targetType, targetId, episodeId = '') {
  return `history:${targetType}:${targetId}:${episodeId || 'live'}`;
}

export function createProgressId(contentId, episodeId = '') {
  return `progress:${contentId}:${episodeId || 'content'}`;
}

export function createSearchId(keyword) {
  return `search:${encodeURIComponent(keyword.trim().toLowerCase())}`;
}

export const defaultSettings = () => ({
  initialized: false,
  autoplayResume: true,
  defaultMovieSource: null,
  defaultLiveSource: null,
  theme: 'sangtian',
  fontSize: 'medium',
  cardStyle: 'poster',
  density: 'comfortable',
});

export const normalizeSettings = (value = {}) => ({
  ...defaultSettings(),
  ...(value && typeof value === 'object' ? value : {}),
});

export const emptyUserData = () => ({
  favorites: [],
  history: [],
  progress: [],
  searches: [],
  settings: defaultSettings(),
  selectedSources: { movie: null, live: null },
});
