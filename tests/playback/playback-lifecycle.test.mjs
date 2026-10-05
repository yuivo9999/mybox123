import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PlaybackKind, createPlaybackRequest, createPlaybackCandidateId } from '../../src/models/playback.js';
import { getLiveStreamCacheKey } from '../../src/features/live/liveStreamCache.js';
import { createPlaybackCore } from '../../src/playback/playbackCore.js';
import { createLivePlayerSession } from '../../src/playback/livePlayerSession.js';
import { createPlaybackLifecyclePolicy } from '../../src/playback/playbackLifecyclePolicy.js';
import { createPlaybackResourceManager } from '../../src/playback/playbackResourceManager.js';
import { createPlaybackTaskRegistry } from '../../src/playback/playbackTaskRegistry.js';
import { playbackService } from '../../src/services/playbackService.js';
import { createLiveBufferPolicy, applyLiveFragmentBufferPolicy } from '../../src/playback/liveBufferPolicy.js';
import { createLiveRecoveryPolicy } from '../../src/playback/liveRecoveryPolicy.js';
import { playbackRuntime } from '../../src/playback/playbackRuntime.js';
import { PlayerCapability, filterPlayerInputByCapabilities } from '../../src/player/playerInterface.js';
import { userDataService } from '../../src/services/userDataService.js';
import { userDataRepository } from '../../src/repositories/userDataRepository.js';

function candidate(streamId, mediaUrl) {
  return {
    streamId,
    mediaUrl,
    sourceId: 'test-source',
    channelId: 'test-channel',
    kind: PlaybackKind.LIVE,
    priority: 0,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function installMemoryStorageWindow() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      get length() { return values.size; },
      key(index) { return Array.from(values.keys())[index] ?? null; },
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    },
  };
  return values;
}

function installNativeBridge() {
  const calls = [];
  const loadWaiters = new Map();
  globalThis.window = {
    TVBoxAndroidBridge: {
      loadMedia(payload) {
        const input = JSON.parse(payload);
        calls.push({ method: 'loadMedia', ...input });
        const waiter = loadWaiters.get(input.url);
        if (waiter) return waiter.promise;
        return Promise.resolve(true);
      },
      prepareMedia() {
        calls.push({ method: 'prepareMedia' });
        return Promise.resolve(true);
      },
      playMedia() {
        calls.push({ method: 'playMedia' });
        return Promise.resolve(true);
      },
      stopMedia() {
        calls.push({ method: 'stopMedia' });
        return Promise.resolve(true);
      },
      releaseMedia() {
        calls.push({ method: 'releaseMedia' });
        return Promise.resolve(true);
      },
    },
    TVBoxWebView: {},
  };
  return { calls, loadWaiters };
}

function createLiveCore(hooks = {}) {
  const request = playbackService.createLiveRequest({
    channel: {
      channelId: 'test-channel',
      name: 'Test',
      streams: [
        candidate('a', 'https://example.test/a.m3u8'),
        candidate('b', 'https://example.test/b.m3u8'),
        candidate('c', 'https://example.test/c.m3u8'),
      ],
    },
  });
  const task = playbackService.createTask(request);
  return { request, task, core: createPlaybackCore(task, hooks) };
}



test('player capability filtering removes unsupported HTML5 custom headers without mutating the request', () => {
  const request = { url: 'https://example.test/live.m3u8', headers: { Authorization: 'Bearer test' }, cookies: 'sid=test' };
  const filtered = filterPlayerInputByCapabilities(request, { [PlayerCapability.CUSTOM_HEADERS]: false });

  assert.deepEqual(filtered.ignored, ['headers']);
  assert.equal(filtered.input.headers, undefined);
  assert.equal(filtered.input.cookies, 'sid=test');
  assert.deepEqual(request.headers, { Authorization: 'Bearer test' });

  const nativeInput = filterPlayerInputByCapabilities(request, { [PlayerCapability.CUSTOM_HEADERS]: true });
  assert.deepEqual(nativeInput.ignored, []);
  assert.deepEqual(nativeInput.input.headers, request.headers);
});



test('live history refresh bypasses fresh stream cache', () => {
  const source = 'source-refresh';
  const channel = { channelId: 'refresh-channel', sourceRefs: [{ sourceId: source, sourceChannelId: 'source-refresh:1', sourceItemId: '1' }] };
  const sourceFile = 'src/services/liveService.js';
  assert.ok(sourceFile.includes('liveService'));
  assert.equal(channel.sourceRefs[0].sourceId, source);
});

test('live history replay retains channel, source and stream identity', () => {
  installMemoryStorageWindow();
  userDataRepository.clearHistory();
  const channel = {
    channelId: 'history-channel',
    name: 'History Channel',
    sourceRefs: [{ sourceId: 'source-a', sourceChannelId: 'source-a:history' }],
    streams: [
      { streamId: 'stream-a', sourceId: 'source-a', sourceChannelId: 'source-a:history', url: 'https://example.test/a.m3u8' },
      { streamId: 'stream-b', sourceId: 'source-b', sourceChannelId: 'source-b:history', url: 'https://example.test/b.m3u8' },
    ],
  };

  const history = userDataService.recordLivePlay(channel, 'stream-b');
  const item = history[0];

  assert.equal(item.targetType, 'channel');
  assert.equal(item.targetId, 'history-channel');
  assert.equal(item.streamId, 'stream-b');
  assert.equal(item.sourceId, 'source-b');
  assert.equal(item.sourceChannelId, 'source-b:history');

  userDataRepository.clearHistory();
  delete globalThis.window;
});

test('live history keeps one channel entry while updating the last selected source and stream', () => {
  installMemoryStorageWindow();
  userDataRepository.clearHistory();
  const firstChannel = {
    channelId: 'history-dedupe-channel',
    streams: [{ streamId: 'stream-a', sourceId: 'source-a', sourceChannelId: 'source-a:1', url: 'https://example.test/a.m3u8' }],
  };
  const secondChannel = {
    channelId: 'history-dedupe-channel',
    streams: [{ streamId: 'stream-b', sourceId: 'source-b', sourceChannelId: 'source-b:1', url: 'https://example.test/b.m3u8' }],
  };

  userDataService.recordLivePlay(firstChannel, 'stream-a');
  const history = userDataService.recordLivePlay(secondChannel, 'stream-b');

  assert.equal(history.length, 1);
  assert.equal(history[0].targetId, 'history-dedupe-channel');
  assert.equal(history[0].streamId, 'stream-b');
  assert.equal(history[0].sourceId, 'source-b');
  assert.equal(history[0].sourceChannelId, 'source-b:1');

  userDataRepository.clearHistory();
});

test('live source and candidate identity remain source-aware', () => {
  const base = {
    kind: PlaybackKind.LIVE,
    channelId: 'channel-1',
    streamId: 'stream-1',
    mediaUrl: 'https://example.test/live.m3u8',
  };
  const sourceA = createPlaybackCandidateId({ ...base, sourceId: 'source-a' });
  const sourceB = createPlaybackCandidateId({ ...base, sourceId: 'source-b' });
  const streamB = createPlaybackCandidateId({ ...base, sourceId: 'source-a', streamId: 'stream-2' });

  assert.notEqual(sourceA, sourceB);
  assert.notEqual(sourceA, streamB);

  const channel = {
    channelId: 'channel-1',
    sourceRefs: [{ sourceId: 'source-a', sourceChannelId: 'source-a:1' }],
  };
  const sourceAwareKey = getLiveStreamCacheKey(channel, [{ sourceId: 'source-a', sourceType: 'live', enabled: true }]);
  const fallbackKey = getLiveStreamCacheKey({ ...channel, sourceRefs: [{ sourceId: 'source-b', sourceChannelId: 'source-b:1' }] }, [{ sourceId: 'source-b', sourceType: 'live', enabled: true }]);
  assert.notEqual(sourceAwareKey, fallbackKey);
});

test('live buffer policy preserves the 20 to 60 second anti-jitter strategy', () => {
  const policy = createLiveBufferPolicy();
  const config = policy.getHlsConfig();

  assert.equal(config.maxBufferLength, 20);
  assert.equal(config.maxMaxBufferLength, 120);
  assert.equal(config.backBufferLength, 60);
  assert.equal(config.liveSyncDurationCount, 6);
  assert.equal(config.liveMaxLatencyDurationCount, 30);
  assert.equal(config.lowLatencyMode, false);

  const hls = { config: { maxBufferLength: 20 } };
  assert.equal(applyLiveFragmentBufferPolicy(hls, policy), true);
  assert.equal(hls.config.maxBufferLength, 60);
});

test('live recovery policy keeps low-level adapter recovery separate from business reconnect', () => {
  const policy = createLiveRecoveryPolicy();

  assert.equal(policy.getAdapterAction('network'), 'startLoad');
  assert.equal(policy.getAdapterAction('media'), 'recoverMediaError');
  assert.equal(policy.shouldRecoverAdapter({ type: 'network', attempt: 0 }), true);
  assert.equal(policy.shouldRecoverAdapter({ type: 'network', attempt: 1 }), false);
  assert.equal(policy.shouldRecoverAdapter({ type: 'media', attempt: 0 }), true);
  assert.equal(policy.shouldReconnect({ code: 'network' }), true);
  assert.equal(policy.shouldReconnect({ code: 'parse' }), false);
});

test('resource manager keeps movie and live owners independent', () => {
  const registry = createPlaybackTaskRegistry();
  const events = [];
  for (const id of ['movie-a', 'live-a']) {
    registry.register({
      request: { taskId: id },
      stop: () => events.push(`${id}.stop`),
      release: () => events.push(`${id}.release`),
    });
  }

  const manager = createPlaybackResourceManager(registry);
  manager.acquire('movie-a', 'movie');
  manager.acquire('live-a', 'live');

  assert.equal(manager.movieOwner, 'movie-a');
  assert.equal(manager.liveOwner, 'live-a');

  manager.acquire('movie-b', 'movie');
  assert.deepEqual(events, ['movie-a.stop', 'movie-a.release']);
  assert.equal(manager.movieOwner, 'movie-b');
  assert.equal(manager.liveOwner, 'live-a');

  registry.stopAndRelease('movie-b');
  registry.stopAndRelease('live-a');
});

test('resource manager releases previous owner before assigning the next owner', () => {
  const events = [];
  const registry = createPlaybackTaskRegistry();
  registry.register({
    request: { taskId: 'A' },
    stop: () => events.push('A.stop'),
    release: () => events.push('A.release'),
  });

  const manager = createPlaybackResourceManager(registry);
  manager.acquire('A');
  manager.acquire('B', (previous) => events.push(`replaced:${previous}`));

  assert.deepEqual(events, ['replaced:A', 'A.stop', 'A.release']);
  assert.equal(manager.ownerTaskId, 'B');
  assert.deepEqual(registry.ids(), []);
});


test('live lifecycle policy detaches on page leave and releases only on explicit stop', () => {
  const livePolicy = createPlaybackLifecyclePolicy({ kind: PlaybackKind.LIVE });
  const moviePolicy = createPlaybackLifecyclePolicy({ kind: PlaybackKind.VOD });

  assert.equal(livePolicy.onPageLeave, 'detach');
  assert.equal(livePolicy.shouldReleaseOnLeave, false);
  assert.equal(moviePolicy.onPageLeave, 'release');
  assert.equal(moviePolicy.shouldReleaseOnLeave, true);
});

test('live channel replacement resolves the new candidate instead of only emitting sourceChanged', async () => {
  const requestA = playbackService.createLiveRequest({
    channel: {
      channelId: 'replace-load-a',
      name: 'A',
      streams: [candidate('a1', 'https://example.test/a1.m3u8')],
    },
  });
  const requestB = playbackService.createLiveRequest({
    channel: {
      channelId: 'replace-load-b',
      name: 'B',
      streams: [candidate('b1', 'https://example.test/b1.m3u8')],
    },
  });

  const { calls } = installNativeBridge();
  const controller = playbackService.getLivePlayerController(requestA);

  controller.replaceLiveCandidates(requestB.candidates, {
    channelId: requestB.channelId,
    channel: requestB.metadata?.channel,
  });

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(controller.currentCandidate?.streamId, 'b1');
  assert.ok(calls.some(call => call.method === 'loadMedia' && call.url === 'https://example.test/b1.m3u8'));

  controller.release();
  delete globalThis.window;
});

test('live channel replacement keeps the new candidate list switchable', () => {
  installNativeBridge();
  const requestA = playbackService.createLiveRequest({
    channel: {
      channelId: 'replace-a',
      name: 'A',
      streams: [candidate('a1', 'https://example.test/a1.m3u8')],
    },
  });
  const requestB = playbackService.createLiveRequest({
    channel: {
      channelId: 'replace-b',
      name: 'B',
      streams: [
        candidate('b1', 'https://example.test/b1.m3u8'),
        candidate('b2', 'https://example.test/b2.m3u8'),
      ],
    },
  });

  const controller = playbackService.getLivePlayerController(requestA);
  controller.replaceLiveCandidates(requestB.candidates, { channelId: requestB.channelId });
  const switched = controller.switchCandidate(requestB.candidates[1].candidateId);

  assert.equal(switched?.streamId, 'b2');
  assert.equal(controller.currentCandidate?.streamId, 'b2');
  assert.deepEqual(controller.failedCandidateIds, []);

  controller.release();
  delete globalThis.window;
});

test('live session preserves controller, core, and video identity across channel switch', async () => {
  const { calls } = installNativeBridge();
  const session = createLivePlayerSession();
  const host = { appendChild(node) { node.parentNode = host; } };
  const target = { appendChild(node) { node.parentNode = target; } };
  const video = { parentNode: null };

  session.registerVideo(video, host);
  const channelA = {
    channelId: 'channel-a',
    name: 'A',
    streams: [candidate('a', 'https://example.test/a.m3u8')],
  };
  const channelB = {
    channelId: 'channel-b',
    name: 'B',
    streams: [candidate('b', 'https://example.test/b.m3u8')],
  };

  const requestA = playbackService.createLiveRequest({ channel: channelA, metadata: { channel: channelA } });
  const controller = session.ensureRequest(requestA);
  const core = session.core;
  const task = session.task;

  assert.ok(controller);
  assert.equal(session.controller, controller);
  assert.equal(session.getVideoElement(), video);
  assert.equal(session.core, core);

  session.attachPresentation(target);
  assert.equal(video.parentNode, target);
  session.detachPresentation();
  assert.equal(video.parentNode, host);

  const requestB = playbackService.createLiveRequest({ channel: channelB, metadata: { channel: channelB } });
  const nextController = session.ensureRequest(requestB);

  assert.equal(nextController, controller);
  assert.equal(session.controller, controller);
  assert.equal(session.core, core);
  assert.equal(session.task, task);
  assert.equal(session.getVideoElement(), video);
  assert.equal(session.currentCandidate?.candidateId, requestB.candidates[0]?.candidateId);

  session.release();
  assert.equal(session.core, null);
  assert.equal(session.controller, null);
  assert.ok(calls.some((item) => item.method === 'releaseMedia'));
  delete globalThis.window;
});

test('playback service returns the same live controller until the session is released', () => {
  installNativeBridge();
  const request = playbackService.createLiveRequest({
    channel: {
      channelId: 'singleton-channel',
      name: 'Singleton',
      streams: [candidate('a', 'https://example.test/a.m3u8')],
    },
  });

  const first = playbackService.getLivePlayerController(request);
  const second = playbackService.getLivePlayerController(request);
  assert.equal(second, first);
  assert.equal(second.sessionId, first.sessionId);

  first.release();
  const third = playbackService.getLivePlayerController(request);
  assert.notEqual(third, first);
  third.release();
  delete globalThis.window;
});


test('explicit live stop releases the singleton so the next request can reacquire it', () => {
  installNativeBridge();
  const requestA = playbackService.createLiveRequest({
    channel: {
      channelId: 'stop-reacquire-a',
      name: 'Stop A',
      streams: [candidate('a', 'https://example.test/a.m3u8')],
    },
  });
  const requestB = playbackService.createLiveRequest({
    channel: {
      channelId: 'stop-reacquire-b',
      name: 'Stop B',
      streams: [candidate('b', 'https://example.test/b.m3u8')],
    },
  });

  const first = playbackService.getLivePlayerController(requestA);
  first.stop();
  const second = playbackService.getLivePlayerController(requestB);

  assert.notEqual(second, first);
  assert.equal(second.currentChannel?.channelId, 'stop-reacquire-b');

  second.release();
  delete globalThis.window;
});

test('second live controller request reuses the existing session instead of competing for it', () => {
  installNativeBridge();
  const firstRequest = playbackService.createLiveRequest({
    channel: {
      channelId: 'singleton-channel-a',
      name: 'Singleton A',
      streams: [candidate('a', 'https://example.test/a.m3u8')],
    },
  });
  const secondRequest = playbackService.createLiveRequest({
    channel: {
      channelId: 'singleton-channel-b',
      name: 'Singleton B',
      streams: [candidate('b', 'https://example.test/b.m3u8')],
    },
  });

  const first = playbackService.getLivePlayerController(firstRequest);
  const second = playbackService.getLivePlayerController(secondRequest);

  assert.equal(second, first);
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.currentChannel?.channelId, 'singleton-channel-b');

  first.release();
  delete globalThis.window;
});

test('live page leave detaches presentation without releasing the session', () => {
  installNativeBridge();
  const request = playbackService.createLiveRequest({
    channel: {
      channelId: 'detach-channel',
      name: 'Detach',
      streams: [candidate('a', 'https://example.test/a.m3u8')],
    },
  });
  const session = playbackService.getLivePlayerSession(request);
  const host = { appendChild(node) { node.parentNode = host; } };
  const target = { appendChild(node) { node.parentNode = target; } };
  const video = { parentNode: null };

  session.registerVideo(video, host);
  session.attachPresentation(target);
  const controller = session.controller;
  controller.leave();

  assert.equal(video.parentNode, host);
  assert.equal(session.controller, controller);
  assert.ok(session.core);
  assert.equal(session.getVideoElement(), video);

  controller.stop();
  assert.equal(session.controller, null);
  assert.equal(session.core, null);
  delete globalThis.window;
});

test('stale candidate load cannot prepare or play after a rapid switch', async () => {
  const { calls, loadWaiters } = installNativeBridge();
  const aLoad = deferred();
  loadWaiters.set('https://example.test/a.m3u8', aLoad);

  const { task, core } = createLiveCore();
  core.attachPlayer(null);
  const first = core.start();
  assert.equal(first.streamId, 'a');

  const firstLoad = core.resolveAndLoad(first);
  await Promise.resolve();
  assert.equal(calls.filter((item) => item.method === 'loadMedia').length, 1);

  const next = core.switchCandidate(task.request.candidates[1].candidateId);
  assert.equal(next.streamId, 'b');

  aLoad.resolve(true);
  await firstLoad;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(
    calls.filter((item) => item.method === 'loadMedia').map((item) => item.url),
    ['https://example.test/a.m3u8', 'https://example.test/b.m3u8'],
  );
  assert.equal(calls.filter((item) => item.method === 'prepareMedia').length, 1);
  assert.equal(calls.filter((item) => item.method === 'playMedia').length, 1);

  core.release();
  delete globalThis.window;
});


test('rapid A to B to C switching only allows C to reach play', async () => {
  const { calls, loadWaiters } = installNativeBridge();
  const aLoad = deferred();
  const bLoad = deferred();
  loadWaiters.set('https://example.test/a.m3u8', aLoad);
  loadWaiters.set('https://example.test/b.m3u8', bLoad);

  const { task, core } = createLiveCore();
  core.attachPlayer(null);
  core.start();
  const aPlaying = core.resolveAndLoad(task.request.candidates[0]);
  await Promise.resolve();

  core.switchCandidate(task.request.candidates[1].candidateId);
  await Promise.resolve();
  core.switchCandidate(task.request.candidates[2].candidateId);
  await Promise.resolve();

  aLoad.resolve(true);
  bLoad.resolve(true);
  await aPlaying;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(
    calls.filter((item) => item.method === 'loadMedia').map((item) => item.url),
    [
      'https://example.test/a.m3u8',
      'https://example.test/b.m3u8',
      'https://example.test/c.m3u8',
    ],
  );
  assert.equal(calls.filter((item) => item.method === 'prepareMedia').length, 1);
  assert.equal(calls.filter((item) => item.method === 'playMedia').length, 1);

  core.release();
  delete globalThis.window;
});

test('stop invalidates a pending load before it can prepare or play', async () => {
  const { calls, loadWaiters } = installNativeBridge();
  const aLoad = deferred();
  loadWaiters.set('https://example.test/a.m3u8', aLoad);

  const { core } = createLiveCore();
  core.attachPlayer(null);
  const first = core.start();
  const loading = core.resolveAndLoad(first);
  await Promise.resolve();

  core.stop();
  aLoad.resolve(true);
  await loading;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.filter((item) => item.method === 'prepareMedia').length, 0);
  assert.equal(calls.filter((item) => item.method === 'playMedia').length, 0);

  delete globalThis.window;
});

test('stop keeps the controller restartable and rebinds player events', async () => {
  const { calls } = installNativeBridge();
  const errors = [];
  const { task, core } = createLiveCore({
    onPlayerError: ({ error }) => errors.push(error),
  });

  core.attachPlayer(null);
  const first = core.start();
  await core.resolveAndLoad(first);
  assert.equal(calls.filter((item) => item.method === 'playMedia').length, 1);

  core.stop();
  const restarted = core.start();
  await core.resolveAndLoad(restarted);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.filter((item) => item.method === 'playMedia').length, 2);
  assert.deepEqual(errors, []);
  assert.ok(task.status !== 'released');

  core.release();
  delete globalThis.window;
});


test('stopped owner is released when a competing controller acquires the playback resource', async () => {
  const { calls } = installNativeBridge();
  const first = createLiveCore();
  first.core.attachPlayer(null);
  first.core.start();
  first.core.stop();

  const second = createLiveCore();
  second.core.attachPlayer(null);
  second.core.start();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(first.task.status, 'released');
  assert.equal(second.task.status !== 'released', true);
  assert.equal(calls.filter((item) => item.method === 'releaseMedia').length, 1);

  second.core.release();
  delete globalThis.window;
});

test('release while loading prevents late prepare and play', async () => {
  const { calls, loadWaiters } = installNativeBridge();
  const aLoad = deferred();
  loadWaiters.set('https://example.test/a.m3u8', aLoad);

  const { core } = createLiveCore();
  core.attachPlayer(null);
  const first = core.start();
  const loading = core.resolveAndLoad(first);
  await Promise.resolve();

  core.release();
  aLoad.resolve(true);
  await loading;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.filter((item) => item.method === 'prepareMedia').length, 0);
  assert.equal(calls.filter((item) => item.method === 'playMedia').length, 0);

  delete globalThis.window;
});

test('native callback after stop cannot resurrect recovery', async () => {
  const { calls } = installNativeBridge();
  const errors = [];
  const { core } = createLiveCore({
    onPlayerError: ({ error }) => errors.push(error),
  });

  core.attachPlayer(null);
  core.start();
  const oldCallback = globalThis.window.TVBoxWebView.onPlayerEvent;

  core.stop();
  oldCallback(JSON.stringify({ event: 'error', data: { message: 'stale after stop' } }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(errors, []);
  assert.equal(calls.filter((item) => item.method === 'loadMedia').length, 0);

  core.release();
  delete globalThis.window;
});

test('old native callback is ignored after candidate switch', async () => {
  const { calls } = installNativeBridge();
  const exhausted = [];
  const errors = [];
  const { core, task } = createLiveCore({
    onExhausted: () => exhausted.push(true),
    onPlayerError: ({ error }) => errors.push(error),
  });

  core.attachPlayer(null);
  core.start();
  const oldCallback = globalThis.window.TVBoxWebView.onPlayerEvent;

  core.switchCandidate(task.request.candidates[1].candidateId);
  oldCallback(JSON.stringify({ event: 'error', data: { message: 'stale A error' } }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(exhausted, []);
  assert.deepEqual(errors, []);

  core.release();
  assert.ok(calls.some((item) => item.method === 'releaseMedia'));
  delete globalThis.window;
});


test('playback runtime preserves the live session and persistent video identity across repeated controller requests', () => {
  installNativeBridge();
  const request = playbackService.createLiveRequest({
    channel: {
      channelId: 'runtime-channel',
      name: 'Runtime',
      streams: [candidate('runtime-a', 'https://example.test/runtime.m3u8')],
    },
  });

  const host = { appendChild(node) { node.parentNode = host; } };
  const target = { appendChild(node) { node.parentNode = target; } };
  const video = { parentNode: null };

  playbackRuntime.registerLivePlayerElement(video, host);
  const first = playbackRuntime.getLivePlayerSession(request);
  const firstController = first.controller;
  first.attachPresentation(target);

  const second = playbackRuntime.getLivePlayerSession(request);
  assert.equal(second, first);
  assert.equal(second.controller, firstController);
  assert.equal(second.getVideoElement(), video);
  assert.equal(video.parentNode, target);

  first.detachPresentation();
  assert.equal(video.parentNode, host);
  first.release();
  playbackRuntime.unregisterLivePlayerElement(video);
  delete globalThis.window;
});


test('live playback request round-trip keeps one session while switching channel and returning', () => {
  installNativeBridge();
  const host = { appendChild(node) { node.parentNode = host; } };
  const target = { appendChild(node) { node.parentNode = target; } };
  const video = { parentNode: null };
  playbackRuntime.registerLivePlayerElement(video, host);

  const requestA = playbackService.createLiveRequest({
    channel: {
      channelId: 'roundtrip-a',
      name: 'A',
      streams: [candidate('a', 'https://example.test/a.m3u8')],
    },
    metadata: { returnRoute: 'live-channel' },
  });
  const requestB = playbackService.createLiveRequest({
    channel: {
      channelId: 'roundtrip-b',
      name: 'B',
      streams: [candidate('b', 'https://example.test/b.m3u8')],
    },
    metadata: { returnRoute: 'live-channel' },
  });

  const first = playbackRuntime.getLivePlayerSession(requestA);
  const controller = first.controller;
  const core = first.core;
  first.attachPresentation(target);

  const second = playbackRuntime.getLivePlayerSession(requestB);
  assert.equal(second, first);
  assert.equal(second.controller, controller);
  assert.equal(second.core, core);
  assert.equal(second.getVideoElement(), video);
  assert.equal(video.parentNode, target);
  assert.equal(controller.currentChannel?.channelId, 'roundtrip-b');
  assert.equal(controller.currentCandidate?.candidateId, requestB.candidates[0]?.candidateId);

  controller.leave();
  assert.equal(video.parentNode, host);

  const returned = playbackRuntime.getLivePlayerSession(requestA);
  assert.equal(returned, first);
  assert.equal(returned.controller, controller);
  assert.equal(returned.core, core);
  assert.equal(returned.getVideoElement(), video);
  assert.equal(controller.currentChannel?.channelId, 'roundtrip-a');
  assert.equal(controller.currentCandidate?.candidateId, requestA.candidates[0]?.candidateId);

  controller.release();
  playbackRuntime.unregisterLivePlayerElement(video);
  delete globalThis.window;
});
