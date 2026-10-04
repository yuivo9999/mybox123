import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPlaybackResourceManager } from '../../src/playback/playbackResourceManager.js';

test('playback resource manager keeps exactly one active owner', () => {
  const released = [];
  const stopped = [];
  const registry = {
    stopAndRelease(taskId) {
      stopped.push(taskId);
      return true;
    },
  };
  const manager = createPlaybackResourceManager(registry);

  const releaseA = manager.acquire('task-a', () => released.push('task-a'));
  assert.equal(manager.ownerTaskId, 'task-a');

  const releaseB = manager.acquire('task-b', () => released.push('task-b'));
  assert.equal(manager.ownerTaskId, 'task-b');
  assert.deepEqual(released, ['task-a']);
  assert.deepEqual(stopped, ['task-a']);

  releaseA();
  assert.equal(manager.ownerTaskId, 'task-b');

  releaseB();
  assert.equal(manager.ownerTaskId, null);
});

test('reacquiring the same task does not self-release the owner', () => {
  const released = [];
  const registry = { stopAndRelease() { throw new Error('should not release same task'); } };
  const manager = createPlaybackResourceManager(registry);

  const release = manager.acquire('task-a', () => released.push('task-a'));
  manager.acquire('task-a', () => released.push('task-a-replaced'));

  assert.equal(manager.ownerTaskId, 'task-a');
  assert.deepEqual(released, []);
  release();
  assert.equal(manager.ownerTaskId, null);
});
