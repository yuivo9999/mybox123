export function createPlaybackResourceManager() {
  let ownerTaskId = null;
  let ownerRelease = null;

  return {
    acquire(taskId, releasePrevious = () => {}) {
      if (ownerTaskId && ownerTaskId !== taskId) {
        ownerRelease?.();
        releasePrevious();
      }
      ownerTaskId = taskId;
      ownerRelease = releasePrevious;
      return () => {
        if (ownerTaskId === taskId) {
          ownerTaskId = null;
          ownerRelease = null;
        }
      };
    },
    get ownerTaskId() {
      return ownerTaskId;
    },
  };
}
