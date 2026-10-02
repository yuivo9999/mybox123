import { userDataService } from '../services/userDataService.js';
import { sourceRepository } from '../repositories/sourceRepository.js';
import { sourceConfigs } from '../data/demoData.js';

const listeners = new Set();
let snapshot = null;

function loadSnapshot() {
  return Object.freeze({
    favorites: userDataService.getSnapshot().favorites,
    history: userDataService.getSnapshot().history,
    progress: userDataService.getSnapshot().progress,
    searches: userDataService.getSnapshot().searches,
    settings: userDataService.getSettings(),
    sources: sourceRepository.getAll(sourceConfigs),
  });
}

function refresh() {
  const user = userDataService.getSnapshot();
  snapshot = Object.freeze({
    favorites: user.favorites,
    history: user.history,
    progress: user.progress,
    searches: user.searches,
    settings: user.settings,
    sources: sourceRepository.getAll(),
  });
  listeners.forEach((listener) => listener());
  return snapshot;
}

function getSnapshot() {
  if (!snapshot) {
    const user = userDataService.getSnapshot();
    snapshot = Object.freeze({
      favorites: user.favorites,
      history: user.history,
      progress: user.progress,
      searches: user.searches,
      settings: userDataService.getSettings(),
      sources: sourceRepository.getAll(),
    });
  }
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
  toggleFavorite(targetType, targetId) {
    userDataService.toggleFavorite(targetType, targetId);
    return refresh();
  },
  recordMoviePlay(movie, episodeIndex = 0) {
    userDataService.recordMoviePlay(movie, episodeIndex);
    return refresh();
  },
  recordProgress(contentId, episodeId, positionSeconds, durationSeconds = null, completed = false) {
    userDataService.recordProgress(contentId, episodeId, positionSeconds, durationSeconds, completed);
    return refresh();
  },
  recordSearch(keyword) {
    userDataService.recordSearch(keyword);
    return refresh();
  },
  clearUserData() {
    userDataService.clearUserData();
    return refresh();
  },
  saveSources(sources) {
    sourceRepository.saveAll(sources);
    return refresh();
  },
  saveSettings(settings) {
    userDataService.saveSettings(settings);
    return refresh();
  },
};

