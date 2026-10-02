import { useSyncExternalStore } from 'react';
import { persistentStateStore } from './persistentStateStore.js';

export function usePersistentState() {
  return useSyncExternalStore(
    persistentStateStore.subscribe,
    persistentStateStore.getSnapshot,
    persistentStateStore.getSnapshot,
  );
}
