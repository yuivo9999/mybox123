import { PlaybackFailureCode } from '../models/playback.js';
import { parserService } from '../parsers/parserService.js';

export function createPlaybackCore(task, hooks = {}) {
  let active = false;
  const unsubscribe = task.subscribe((event) => hooks.onEvent?.(event));

  const resolve = async (candidate = task.currentCandidate, options = {}) => {
    if (!candidate) return null;
    try {
      const resolved = await parserService.resolve(candidate, options);
      hooks.onResolvedInput?.(resolved);
      return resolved;
    } catch (error) {
      const code = error?.message || PlaybackFailureCode.PARSER;
      hooks.onParserError?.({ candidate, error, code });
      return null;
    }
  };

  return {
    get request() { return task.request; },
    get task() { return task; },
    start() {
      active = true;
      return task.start();
    },
    resolve,
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
