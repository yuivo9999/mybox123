import { useSyncExternalStore } from 'react';
import { persistentStateStore } from './persistentStateStore.js';

export function usePersistentState() {
  const snapshot = useSyncExternalStore(
    persistentStateStore.subscribe,
    persistentStateStore.getSnapshot,
    persistentStateStore.getSnapshot,
  );
  return {
    ...snapshot,
    reload: persistentStateStore.reload,
    toggleFavorite: persistentStateStore.toggleFavorite,
    recordMoviePlay: persistentStateStore.recordMoviePlay,
    recordLivePlay: persistentStateStore.recordLivePlay,
    recordProgress: persistentStateStore.recordProgress,
    recordSearch: persistentStateStore.recordSearch,
    clearHistory: persistentStateStore.clearHistory,
    removeSearch: persistentStateStore.removeSearch,
    clearSearches: persistentStateStore.clearSearches,
    clearUserData: persistentStateStore.clearUserData,
    clearCache: persistentStateStore.clearCache,
    saveSources: persistentStateStore.saveSources,
    setSourceEnabled: persistentStateStore.setSourceEnabled,
    setSourceActive: persistentStateStore.setSourceActive,
    removeSource: persistentStateStore.removeSource,
    saveSettings: persistentStateStore.saveSettings,
  };
}
