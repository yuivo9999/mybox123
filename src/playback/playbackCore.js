import { PlaybackFailureCode, PlaybackKind } from '../models/playback.js';
import { parserService } from '../parsers/parserService.js';
import { createHtml5PlayerAdapter } from '../player/html5PlayerAdapter.js';
import { PlayerState } from '../player/playerInterface.js';
import { createPlaybackEventBus } from './playbackEventBus.js';
import { createPlaybackStateMachine } from './playbackStateMachine.js';
import { createPlaybackNetworkPolicy } from './playbackNetworkPolicy.js';
import { classifyPlaybackError } from './playbackErrorPolicy.js';

export function createPlaybackCore(task, hooks = {}) {
  let active = false;
  let player = null;
  let playerElement = null;
  let resourceRelease = null;
  const eventBus = createPlaybackEventBus();
  const stateMachine = createPlaybackStateMachine(task.request.kind ?? PlaybackKind.VOD);
  const networkPolicy = createPlaybackNetworkPolicy(hooks.networkPolicy);
  const unsubscribe = task.subscribe((event) => {
    eventBus.emit(event);
    hooks.onEvent?.(event);
  });

  const transition = (next) => {
    try {
      stateMachine.transition(next);
    } catch {
      stateMachine.reset();
      if (next !== PlayerState.IDLE) stateMachine.transition(next);
    }
    hooks.onStateChange?.(stateMachine.state);
    return stateMachine.state;
  };

  const handlePlayerEvent = (event) => {
    if (event.event === 'loading') transition(PlayerState.LOADING);
    if (event.event === 'prepared') transition(PlayerState.PREPARING);
    if (event.event === 'playing') transition(PlayerState.PLAYING);
    if (event.event === 'paused') transition(PlayerState.PAUSED);
    if (event.event === 'buffering') transition(PlayerState.BUFFERING);
    if (event.event === 'completed') {
      if (task.request.kind === PlaybackKind.VOD) transition(PlayerState.COMPLETED);
    }
    if (event.event === 'stopped') transition(PlayerState.STOPPED);
    if (event.event === 'released') transition(PlayerState.RELEASED);
    if (event.event === 'progress') {
      eventBus.emit({
        event: 'progress',
        requestId: task.request.requestId,
        taskId: task.request.taskId,
        currentTime: event.currentTime,
        duration: event.duration,
      });
    }
    if (event.event === 'error') {
      const code = classifyPlaybackError(event.nativeError, { code: event.nativeError?.message });
      transition(PlayerState.ERROR);
      const next = failAndResolve(event.nativeError ?? new Error('MEDIA_LOAD_ERROR'), code);
      if (!next) hooks.onExhausted?.(task);
    }
    if (event.event === 'requestContextIgnored') hooks.onPlayerWarning?.(event);
  };

  const attachPlayer = (element) => {
    if (player) player.release();
    playerElement = element;
    if (!element) return null;
    player = createHtml5PlayerAdapter(element, { onEvent: handlePlayerEvent });
    return player;
  };

  const resolve = async (candidate = task.currentCandidate, options = {}) => {
    if (!candidate) return null;
    try {
      const resolved = await parserService.resolve(candidate, options);
      hooks.onResolvedInput?.(resolved);
      return resolved;
    } catch (error) {
      const code = classifyPlaybackError(error, { code: error?.message, fromParser: true });
      hooks.onParserError?.({ candidate, error, code });
      eventBus.emit({ event: 'error', requestId: task.request.requestId, taskId: task.request.taskId, candidateId: candidate.candidateId, code });
      return null;
    }
  };

  const playResolved = async (input) => {
    if (!player) throw new Error('PLAYER_ADAPTER_NOT_ATTACHED');
    player.load(input);
    player.prepare();
    if (input.playerHint?.autoplay) await player.play();
    return input;
  };

  const resolveAndLoad = async (candidate = task.currentCandidate, options = {}) => {
    const input = await resolve(candidate, options);
    if (!input) return null;
    await playResolved(input);
    return input;
  };

  const failAndResolve = (error, code = PlaybackFailureCode.UNKNOWN) => {
    const classified = classifyPlaybackError(error, { code });
    const next = task.fail(error, classified);
    hooks.onCandidateChange?.(next);
    networkPolicy.reset();
    if (!next) return null;
    void resolveAndLoad(next).catch((playerError) => {
      hooks.onPlayerError?.({ error: playerError, candidate: next });
    });
    return next;
  };

  return {
    get request() { return task.request; },
    get task() { return task; },
    get state() { return stateMachine.state; },
    get capabilities() { return player?.capabilities ?? {}; },
    get currentPlayer() { return player; },
    subscribe(listener) { return eventBus.subscribe(listener); },
    attachPlayer,
    start() {
      if (!player && playerElement) attachPlayer(playerElement);
      active = true;
      resourceRelease?.();
      resourceRelease = hooks.resourceManager?.acquire(task.request.taskId) ?? null;
      const initial = task.start();
      if (initial) transition(PlayerState.LOADING);
      return initial;
    },
    async resolveAndLoad(candidate = task.currentCandidate, options = {}) {
      return resolveAndLoad(candidate, options);
    },
    resolve,
    async play() {
      if (!player) throw new Error('PLAYER_ADAPTER_NOT_ATTACHED');
      await player.play();
    },
    pause() {
      return player?.pause();
    },
    seek(seconds) {
      return player?.seek(seconds);
    },
    setVolume(value) {
      return player?.setVolume(value);
    },
    markPlaying() {
      return task.markPlaying();
    },
    retry(options) {
      if (!networkPolicy.shouldRetry({ code: options?.code ?? 'network' })) return null;
      const candidate = task.retry(options);
      if (candidate) void resolveAndLoad(candidate).catch((error) => hooks.onPlayerError?.({ error, candidate }));
      return candidate;
    },
    fail(error, code = PlaybackFailureCode.UNKNOWN) {
      return failAndResolve(error, code);
    },
    switchCandidate(candidateId) {
      const next = task.switchCandidate(candidateId);
      hooks.onCandidateChange?.(next);
      if (next) {
        transition(PlayerState.LOADING);
        void resolveAndLoad(next).catch((error) => hooks.onPlayerError?.({ error, candidate: next }));
      }
      return next;
    },
    stop() {
      active = false;
      player?.stop();
      task.stop();
      resourceRelease?.();
      resourceRelease = null;
    },
    release() {
      active = false;
      player?.release();
      player = null;
      resourceRelease?.();
      resourceRelease = null;
      unsubscribe();
      eventBus.clear();
      task.release();
    },
  };
}
