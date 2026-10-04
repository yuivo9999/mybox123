import { playbackTaskRegistry } from './playbackTaskRegistry.js';

export function createPlaybackResourceManager(registry = playbackTaskRegistry) {
  const owners = {
    movie: { taskId: null, release: null },
    live: { taskId: null, release: null },
  };

  const normalizeKind = kind => kind === 'live' ? 'live' : 'movie';

  return {
    acquire(taskId, kind = 'movie', onReplaced = () => {}) {
      const domain = normalizeKind(kind);
      const current = owners[domain];

      if (current.taskId && current.taskId !== taskId) {
        const previous = current.taskId;
        current.release?.();
        onReplaced(previous);
        registry.stopAndRelease(previous);
      }

      current.taskId = taskId;
      current.release = () => {
        if (owners[domain].taskId === taskId) {
          owners[domain].taskId = null;
          owners[domain].release = null;
        }
      };

      return current.release;
    },

    get ownerTaskId() {
      return owners.movie.taskId || owners.live.taskId;
    },

    get movieOwner() {
      return owners.movie.taskId;
    },

    get liveOwner() {
      return owners.live.taskId;
    },

    getOwner(kind = 'movie') {
      return owners[normalizeKind(kind)].taskId;
    },
  };
}

export const playbackResourceManager = createPlaybackResourceManager();
