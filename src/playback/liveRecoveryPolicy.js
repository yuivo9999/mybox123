const DEFAULT_LIVE_RECOVERY_POLICY = Object.freeze({
  maxAdapterRecoveryAttempts: 1,
});

export function createLiveRecoveryPolicy(overrides = {}) {
  const config = Object.freeze({
    ...DEFAULT_LIVE_RECOVERY_POLICY,
    ...overrides,
  });

  return Object.freeze({
    maxAdapterRecoveryAttempts: config.maxAdapterRecoveryAttempts,
    shouldRecoverAdapter({ type, attempt = 0 } = {}) {
      if (attempt >= config.maxAdapterRecoveryAttempts) return false;
      return type === 'network' || type === 'media';
    },
    getAdapterAction(type) {
      if (type === 'network') return 'startLoad';
      if (type === 'media') return 'recoverMediaError';
      return null;
    },
    shouldReconnect({ code } = {}) {
      return ['network', 'player', 'NetworkError'].includes(code);
    },
  });
}

export const liveRecoveryPolicy = createLiveRecoveryPolicy();
