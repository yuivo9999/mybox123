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
    toggleFavorite: persistentStateStore.toggleFavorite,
    recordMoviePlay: persistentStateStore.recordMoviePlay,
    recordLivePlay: persistentStateStore.recordLivePlay,
    recordProgress: persistentStateStore.recordProgress,
    recordSearch: persistentStateStore.recordSearch,
    removeSearch: persistentStateStore.removeSearch,
    clearSearches: persistentStateStore.clearSearches,
    clearUserData: persistentStateStore.clearUserData,
    clearCache: persistentStateStore.clearCache,
    saveSources: persistentStateStore.saveSources,
    setSourceEnabled: persistentStateStore.setSourceEnabled,
    removeSource: persistentStateStore.removeSource,
    saveSettings: persistentStateStore.saveSettings,
  };
}
