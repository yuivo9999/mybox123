import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PlaybackKind, createPlaybackRequest } from '../../src/models/playback.js';
import { createPlaybackCore } from '../../src/playback/playbackCore.js';
import { createLivePlayerSession } from '../../src/playback/livePlayerSession.js';
import { createPlaybackLifecyclePolicy } from '../../src/playback/playbackLifecyclePolicy.js';
import { createPlaybackResourceManager } from '../../src/playback/playbackResourceManager.js';
import { createPlaybackTaskRegistry } from '../../src/playback/playbackTaskRegistry.js';
import { playbackService } from '../../src/services/playbackService.js';
import { createLiveBufferPolicy } from '../../src/playback/liveBufferPolicy.js';
import { createLiveRecoveryPolicy } from '../../src/playback/liveRecoveryPolicy.js';

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
  policy.onFragmentLoaded(hls);
  assert.equal(hls.config.maxBufferLength, 60);
});

test('live recovery policy keeps low-level adapter recovery separate from business reconnect', () => {
  const policy = createLiveRecoveryPolicy();

  assert.equal(policy.getAdapterAction('network'), 'startLoad');
  assert.equal(policy.getAdapterAction('media'), 'recoverMediaError');
  assert.equal(policy.shouldRecoverAdapter({ type: 'network', attempt: 0 }), true);
  assert.equal(policy.shouldRecoverAdapter({ type: 'network', attempt: 1 }), false);
  assert.equal(policy.shouldRecoverAdapter({ type: 'media', attempt: 0 }), true);
  assert.equal(policy.shouldRecoverAdapter({ type: 'network', attempt: 0, isLive: false }), true);
  assert.equal(policy.shouldRecoverAdapter({ type: 'network', attempt: 1, isLive: false }), false);
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
