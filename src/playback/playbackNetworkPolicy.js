export function createPlaybackNetworkPolicy({ maxRetries = 2, retryWindowMs = 10000 } = {}) {
  let retryCount = 0;
  let windowStartedAt = 0;

  return {
    shouldRetry({ code } = {}) {
      const retryable = code === 'network' || code === 'player' || code === 'NetworkError';
      if (!retryable) return false;
      const now = Date.now();
      if (!windowStartedAt || now - windowStartedAt > retryWindowMs) {
        windowStartedAt = now;
        retryCount = 0;
      }
      if (retryCount >= maxRetries) return false;
      retryCount += 1;
      return true;
    },
    reset() {
      retryCount = 0;
      windowStartedAt = 0;
    },
    get retryCount() { return retryCount; },
  };
}
