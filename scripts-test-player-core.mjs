import assert from 'node:assert/strict';
import { PlaybackKind } from './src/models/playback.js';
import { PlayerState, createPlayerAdapterContract } from './src/player/playerInterface.js';
import { createPlaybackStateMachine } from './src/playback/playbackStateMachine.js';
import { createPlaybackNetworkPolicy } from './src/playback/playbackNetworkPolicy.js';
import { createPlaybackResourceManager } from './src/playback/playbackResourceManager.js';

const vod = createPlaybackStateMachine(PlaybackKind.VOD);
assert.equal(vod.state, PlayerState.IDLE);
vod.transition(PlayerState.LOADING);
vod.transition(PlayerState.PREPARING);
vod.transition(PlayerState.PLAYING);
vod.transition(PlayerState.BUFFERING);
vod.transition(PlayerState.PLAYING);
vod.transition(PlayerState.COMPLETED);
vod.transition(PlayerState.RELEASED);
assert.equal(vod.state, PlayerState.RELEASED);

const live = createPlaybackStateMachine(PlaybackKind.LIVE);
live.transition(PlayerState.LOADING);
live.transition(PlayerState.PREPARING);
live.transition(PlayerState.PLAYING);
live.transition(PlayerState.BUFFERING);
live.transition(PlayerState.PLAYING);
live.transition(PlayerState.STOPPED);
live.transition(PlayerState.RELEASED);
assert.equal(live.state, PlayerState.RELEASED);

assert.throws(() => createPlayerAdapterContract({}), /PLAYER_ADAPTER_METHOD_REQUIRED/);

const policy = createPlaybackNetworkPolicy({ maxRetries: 2, retryWindowMs: 1000 });
assert.equal(policy.shouldRetry({ code: 'network' }), true);
assert.equal(policy.shouldRetry({ code: 'player' }), true);
assert.equal(policy.shouldRetry({ code: 'network' }), false);
assert.equal(policy.shouldRetry({ code: 'unsupported' }), false);

const resources = createPlaybackResourceManager();
let replaced = null;
const releaseA = resources.acquire('task-a');
resources.acquire('task-b', (taskId) => { replaced = taskId; });
assert.equal(replaced, 'task-a');
assert.equal(resources.ownerTaskId, 'task-b');
releaseA();
assert.equal(resources.ownerTaskId, 'task-b');

console.log('Player core tests passed');
