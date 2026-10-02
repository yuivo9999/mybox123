import { createFavoriteId, createHistoryId, createProgressId, createSearchId, emptyUserData } from '../models/userData';
import { storage } from './storage';

const LEGACY_KEYS = {
  favorites: 'tvbox:favorites',
  history: 'tvbox:history',
  searches: 'tvbox:searches',
  sources: 'tvbox:sources',
};

function legacyRead(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function migrateFavorites(items) {
  return items.map((item) => ({
    favoriteId: createFavoriteId(item.kind === 'live' ? 'channel' : 'content', item.id),
    targetType: item.kind === 'live' ? 'channel' : 'content',
    targetId: item.id,
    createdAt: item.at ?? Date.now(),
    lastAccessedAt: item.at ?? Date.now(),
  }));
}

function migrateHistory(items) {
  return items.map((item) => {
    const targetType = item.kind === 'live' ? 'channel' : 'content';
    const episodeId = targetType === 'content' && Number.isInteger(item.episode)
      ? `legacy-episode:${item.id}:${item.episode}`
      : '';
    return {
      historyId: createHistoryId(targetType, item.id, episodeId),
      targetType,
      targetId: item.id,
      episodeId,
      sourceId: item.sourceId ?? null,
      sourceItemId: item.sourceItemId ?? null,
      lastPlayedAt: item.at ?? Date.now(),
      completed: Boolean(item.completed),
    };
  });
}

function migrateProgress(items) {
  return items.filter((item) => item.kind === 'movie').map((item) => ({
    progressId: createProgressId(item.id, Number.isInteger(item.episode) ? `legacy-episode:${item.id}:${item.episode}` : ''),
    contentId: item.id,
    episodeId: Number.isInteger(item.episode) ? `legacy-episode:${item.id}:${item.episode}` : '',
    positionSeconds: Number(item.progress) || 0,
    durationSeconds: null,
    updatedAt: item.at ?? Date.now(),
    completed: false,
  }));
}

export function migrateLegacyData() {
  const marker = storage.read('migration:legacy-v1', null);
  if (marker) return marker;

  const base = emptyUserData();
  const legacyFavorites = legacyRead(LEGACY_KEYS.favorites, []);
  const legacyHistory = legacyRead(LEGACY_KEYS.history, []);
  const legacySearches = legacyRead(LEGACY_KEYS.searches, []);
  const legacySources = legacyRead(LEGACY_KEYS.sources, null);

  const migrated = {
    ...base,
    favorites: migrateFavorites(Array.isArray(legacyFavorites) ? legacyFavorites : []),
    history: migrateHistory(Array.isArray(legacyHistory) ? legacyHistory : []),
    progress: migrateProgress(Array.isArray(legacyHistory) ? legacyHistory : []),
    searches: (Array.isArray(legacySearches) ? legacySearches : []).map((keyword) => ({
      searchId: createSearchId(String(keyword)), keyword: String(keyword), searchedAt: Date.now(), count: 1,
    })),
  };

  storage.write('favorites', migrated.favorites);
  storage.write('history', migrated.history);
  storage.write('progress', migrated.progress);
  storage.write('searches', migrated.searches);
  if (Array.isArray(legacySources)) storage.write('sources', legacySources.map((source, index) => ({
    sourceId: source.sourceId ?? source.id ?? `legacy-source:${index + 1}`,
    name: source.name ?? `旧源 ${index + 1}`,
    sourceType: source.sourceType ?? source.type ?? 'movie',
    sourceRef: source.sourceRef ?? source.url ?? '',
    enabled: source.enabled !== false,
    status: source.status ?? 'unknown',
    order: source.order ?? index + 1,
    lastUsedAt: source.lastUsedAt ?? null,
  })));

  const result = { completedAt: Date.now(), migrated: true };
  storage.write('migration:legacy-v1', result);
  return result;
}
