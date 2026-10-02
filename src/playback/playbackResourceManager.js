export function createPlaybackResourceManager() {
  let ownerTaskId = null;
  let ownerRelease = null;

  return {
    acquire(taskId, onReplaced = () => {}) {
      if (ownerTaskId && ownerTaskId !== taskId) {
        ownerRelease?.();
        onReplaced(ownerTaskId);
      }
      ownerTaskId = taskId;
      ownerRelease = () => {
        if (ownerTaskId === taskId) {
          ownerTaskId = null;
          ownerRelease = null;
        }
      };
      return ownerRelease;
    },
    get ownerTaskId() {
      return ownerTaskId;
    },
  };
}

export const playbackResourceManager = createPlaybackResourceManager();
