import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PlaybackKind, createPlaybackRequest } from '../../src/models/playback.js';
import { createPlaybackCore } from '../../src/playback/playbackCore.js';
import { createPlaybackResourceManager } from '../../src/playback/playbackResourceManager.js';
import { createPlaybackTaskRegistry } from '../../src/playback/playbackTaskRegistry.js';
import { playbackService } from '../../src/services/playbackService.js';

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
