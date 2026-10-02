import { userDataRepository } from '../repositories/userDataRepository';

export const userDataService = {
  getSettings() {\n    return userDataRepository.getSettings();\n  },\n  saveSettings(value) {\n    userDataRepository.saveSettings(value);\n    return value;\n  },\n  getSnapshot() {
    return {
      favorites: userDataRepository.getFavorites(),
      history: userDataRepository.getHistory(),
      progress: userDataRepository.getProgress(),
      searches: userDataRepository.getSearches(),
    };
  },
  toggleFavorite(targetType, targetId) {
    const current = userDataRepository.getFavorites();
    const exists = current.some((item) => item.targetType === targetType && item.targetId === targetId);
    const next = exists
      ? current.filter((item) => !(item.targetType === targetType && item.targetId === targetId))
      : [...current, {
          favoriteId: userDataRepository.ids.createFavoriteId(targetType, targetId),
          targetType, targetId, createdAt: Date.now(), lastAccessedAt: Date.now(),
        }];
    userDataRepository.saveFavorites(next);
    return next;
  },
  recordMoviePlay(content, episodeIndex = 0) {
    const episode = content.episodes[episodeIndex] ?? null;
    const episodeId = episode?.episodeId ?? '';
    const sourceRef = episode?.sourceRefs?.[0] ?? content.sourceRefs?.[0] ?? {};
    const now = Date.now();
    const historyItem = {
      historyId: userDataRepository.ids.createHistoryId('content', content.contentId, episodeId),
      targetType: 'content', targetId: content.contentId, episodeId,
      sourceId: sourceRef.sourceId ?? null, sourceItemId: sourceRef.sourceItemId ?? null,
      lastPlayedAt: now, completed: false,
    };
    const history = [historyItem, ...userDataRepository.getHistory().filter((item) => item.historyId !== historyItem.historyId)].slice(0, 50);
    userDataRepository.saveHistory(history);
    return history;
  },
  recordProgress(contentId, episodeId, positionSeconds, durationSeconds = null, completed = false) {
    const progressItem = {
      progressId: userDataRepository.ids.createProgressId(contentId, episodeId),
      contentId, episodeId, positionSeconds: Math.max(0, Number(positionSeconds) || 0),
      durationSeconds: durationSeconds == null ? null : Math.max(0, Number(durationSeconds) || 0),
      updatedAt: Date.now(), completed,
    };
    const progress = [progressItem, ...userDataRepository.getProgress().filter((item) => item.progressId !== progressItem.progressId)].slice(0, 100);
    userDataRepository.saveProgress(progress);
    return progress;
  },
  recordSearch(keyword) {
    const clean = keyword.trim();
    if (!clean) return userDataRepository.getSearches();
    const existing = userDataRepository.getSearches().find((item) => item.keyword.toLowerCase() === clean.toLowerCase());
    const nextItem = {
      searchId: userDataRepository.ids.createSearchId(clean), keyword: clean,
      searchedAt: Date.now(), count: (existing?.count ?? 0) + 1,
    };
    const searches = [nextItem, ...userDataRepository.getSearches().filter((item) => item.searchId !== nextItem.searchId)].slice(0, 20);
    userDataRepository.saveSearches(searches);
    return searches;
  },
  clearUserData() {
    userDataRepository.clearUserData();
    return this.getSnapshot();
  },
};
