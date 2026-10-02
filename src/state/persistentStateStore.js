import { userDataService } from '../services/userDataService.js';
import { cacheService } from '../services/cacheService.js';
import { sourceRepository } from '../repositories/sourceRepository.js';

const listeners = new Set();
let snapshot = null;

function buildSnapshot() {
  const user = userDataService.getSnapshot();
  return Object.freeze({
    favorites: user.favorites,
    history: user.history,
    progress: user.progress,
    searches: user.searches,
    settings: user.settings,
    selectedSources: user.selectedSources,
    migration: user.migration,
    sources: sourceRepository.getAll(),
  });
}

function refresh() {
  snapshot = buildSnapshot();
  listeners.forEach((listener) => listener());
  return snapshot;
}

function getSnapshot() {
  if (!snapshot) snapshot = buildSnapshot();
  return snapshot;
}

export const persistentStateStore = {
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot,
  reload: refresh,
  toggleFavorite(targetType, targetId) { userDataService.toggleFavorite(targetType, targetId); return refresh(); },
  touchFavorite(targetType, targetId) { userDataService.touchFavorite(targetType, targetId); return refresh(); },
  recordMoviePlay(movie, episodeIndex = 0, sourceId = null) { userDataService.recordMoviePlay(movie, episodeIndex, sourceId); return refresh(); },
  recordLivePlay(channel, streamId = null) { userDataService.recordLivePlay(channel, streamId); return refresh(); },
  recordProgress(contentId, episodeId, positionSeconds, durationSeconds = null, completed = false) {
    userDataService.recordProgress(contentId, episodeId, positionSeconds, durationSeconds, completed);
    return refresh();
  },
  recordSearch(keyword) { userDataService.recordSearch(keyword); return refresh(); },
  clearHistory() { userDataService.clearHistory(); return refresh(); },
  removeSearch(searchId) { userDataService.removeSearch(searchId); return refresh(); },
  clearSearches() { userDataService.clearSearches(); return refresh(); },
  clearUserData() { userDataService.clearUserData(); return refresh(); },
  clearCache() { return cacheService.clearAll(); },
  saveSources(sources) { sourceRepository.saveAll(sources); return refresh(); },
  setSourceActive(sourceId) {
    const all = sourceRepository.getAll();
    const source = all.find(item => item.sourceId === sourceId);
    if (!source) return getSnapshot();
    const sourceType = source.sourceType || 'movie';
    userDataService.setSelectedSource(sourceType, sourceId);
    const now = Date.now();
    sourceRepository.saveAll(all.map(item => ({
      ...item,
      isActive: item.sourceType === sourceType ? item.sourceId === sourceId : item.isActive,
      enabled: item.sourceId === sourceId ? true : item.enabled,
      lastUsedAt: item.sourceId === sourceId ? now : item.lastUsedAt ?? null,
    })));
    return refresh();
  },
  setSourceEnabled(sourceId, enabled) {
    const source = sourceRepository.getAll().find(item => item.sourceId === sourceId);
    if (!source) return getSnapshot();
    if (!enabled) userDataService.clearSelectedSource(source.sourceType, sourceId);
    const next = sourceRepository.getAll().map((item) => item.sourceId === sourceId ? { ...item, enabled: Boolean(enabled), isActive: enabled ? item.isActive : false } : item);
    return this.saveSources(next);
  },
  removeSource(sourceId) {
    const source = sourceRepository.getAll().find(item => item.sourceId === sourceId);
    const selected = userDataService.getSnapshot().selectedSources;
    if (source && selected[source.sourceType] === sourceId) userDataService.clearSelectedSource(source.sourceType, sourceId);
    return this.saveSources(sourceRepository.getAll().filter((item) => item.sourceId !== sourceId));
  },
  saveSettings(settings) { userDataService.saveSettings(settings); return refresh(); },
};
