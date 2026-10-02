import { PlaybackFailureCode } from '../models/playback.js';

/**
 * Stage-13 boundary only: owns a PlaybackTask, not parser/player implementation.
 * Stage 14/15 can plug Parser and PlayerAdapter into this boundary without changing pages.
 */
export function createPlaybackCore(task, hooks = {}) {
  let active = false;
  const unsubscribe = task.subscribe((event) => hooks.onEvent?.(event));

  return {
    get request() { return task.request; },
    get task() { return task; },
    start() {
      active = true;
      return task.start();
    },
    markPlaying() {
      return task.markPlaying();
    },
    retry(options) {
      return task.retry(options);
    },
    fail(error, code = PlaybackFailureCode.UNKNOWN) {
      const next = task.fail(error, code);
      hooks.onCandidateChange?.(next);
      if (!next && active) hooks.onExhausted?.(task);
      return next;
    },
    switchCandidate(candidateId) {
      const next = task.switchCandidate(candidateId);
      hooks.onCandidateChange?.(next);
      return next;
    },
    stop() {
      active = false;
      task.stop();
    },
    release() {
      active = false;
      unsubscribe();
      task.release();
    },
  };
}
