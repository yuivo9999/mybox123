const DEFAULT_LIVE_BUFFER_POLICY = Object.freeze({
  initialMaxBufferLength: 20,
  steadyMaxBufferLength: 60,
  maxMaxBufferLength: 120,
  backBufferLength: 60,
  maxBufferSize: 80 * 1000 * 1000,
  maxBufferHole: 0.8,
  highBufferWatchdogPeriod: 2,
  nudgeOffset: 0.2,
  nudgeMaxRetry: 5,
  liveSyncDurationCount: 6,
  liveMaxLatencyDurationCount: 30,
  lowLatencyMode: false,
});

export function createLiveBufferPolicy(overrides = {}) {
  const config = Object.freeze({
    ...DEFAULT_LIVE_BUFFER_POLICY,
    ...overrides,
  });

  return Object.freeze({
    ...config,
    getHlsConfig() {
      return {
        enableWorker: true,
        lowLatencyMode: config.lowLatencyMode,
        backBufferLength: config.backBufferLength,
        maxBufferLength: config.initialMaxBufferLength,
        maxMaxBufferLength: config.maxMaxBufferLength,
        maxBufferSize: config.maxBufferSize,
        maxBufferHole: config.maxBufferHole,
        highBufferWatchdogPeriod: config.highBufferWatchdogPeriod,
        nudgeOffset: config.nudgeOffset,
        nudgeMaxRetry: config.nudgeMaxRetry,
        liveSyncDurationCount: config.liveSyncDurationCount,
        liveMaxLatencyDurationCount: config.liveMaxLatencyDurationCount,
        fragLoadingTimeOut: 25000,
        manifestLoadingTimeOut: 25000,
      };
    },
    onFragmentLoaded(hls) {
      if (hls?.config && hls.config.maxBufferLength < config.steadyMaxBufferLength) {
        hls.config.maxBufferLength = config.steadyMaxBufferLength;
      }
    },
  });
}

export const liveBufferPolicy = createLiveBufferPolicy();
