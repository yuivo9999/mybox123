import assert from 'node:assert/strict';
import { normalizeContent } from './src/models/content.js';
import { normalizeChannel } from './src/models/live.js';
import { PlaybackFailureCode, PlaybackKind } from './src/models/playback.js';
import { playbackService } from './src/services/playbackService.js';

const content = normalizeContent({
  sourceId: 'movie-a',
  sourceItemId: 'm1',
  title: 'Demo',
  type: 'movie',
  episodes: [{
    title: '正片',
    playbackCandidates: [
      { sourceId: 'movie-a', mediaUrl: 'https://example.com/a.mp4', protocol: 'mp4', priority: 10 },
      { sourceId: 'movie-b', mediaUrl: 'https://example.com/b.m3u8', protocol: 'hls', priority: 1 },
    ],
  }],
});
const episode = content.episodes[0];
const vodRequest = playbackService.createVODRequest({ content, episode, metadata: { title: content.title } });
assert.equal(vodRequest.kind, PlaybackKind.VOD);
assert.equal(vodRequest.candidates.length, 2);
assert.equal(vodRequest.candidates[0].mediaUrl, 'https://example.com/a.mp4');
assert.ok(vodRequest.requestId.startsWith('playback-request:'));
assert.ok(vodRequest.taskId.startsWith('playback-task:'));

const task = playbackService.createTask(vodRequest);
assert.equal(task.currentCandidate.mediaUrl, 'https://example.com/a.mp4');
task.start();
const next = task.fail(new Error('network'), PlaybackFailureCode.NETWORK);
assert.equal(next.mediaUrl, 'https://example.com/b.m3u8');
assert.deepEqual(task.failedCandidateIds, [vodRequest.candidates[0].candidateId]);
assert.equal(task.retry(), task.currentCandidate);
assert.equal(task.retry(), task.currentCandidate);
assert.equal(task.retry(), null);
assert.equal(task.switchCandidate(vodRequest.candidates[0].candidateId), null);
task.release();
assert.equal(task.status, 'released');

const channel = normalizeChannel({
  sourceId: 'live-a',
  sourceItemId: 'c1',
  name: 'News',
  category: '新闻',
  streams: [
    { url: 'https://example.com/live-a.m3u8', label: '主线' },
    { url: 'https://example.com/live-b.m3u8', label: '备用' },
  ],
});
const liveRequest = playbackService.createLiveRequest({ channel });
assert.equal(liveRequest.kind, PlaybackKind.LIVE);
assert.equal(liveRequest.channelId, channel.channelId);
assert.equal(liveRequest.candidates.length, 2);
assert.equal(liveRequest.candidates[0].channelId, channel.channelId);
assert.equal(liveRequest.candidates[0].streamId, channel.streams[0].streamId);
assert.deepEqual(liveRequest.fallbackCandidateIds, [liveRequest.candidates[1].candidateId]);

const expiredContent = normalizeContent({ sourceId: 'movie-expired', sourceItemId: 'm2', title: 'Expired', type: 'movie', episodes: [{ title: '正片', playbackCandidates: [{ mediaUrl: 'https://example.com/expired.m3u8', expiresAt: Date.now() - 1000 }, { mediaUrl: 'https://example.com/fresh.mp4' }] }] });
const expiredRequest = playbackService.createVODRequest({ content: expiredContent, episode: expiredContent.episodes[0] });
const expiredTask = playbackService.createTask(expiredRequest);
assert.equal(expiredTask.start().mediaUrl, 'https://example.com/fresh.mp4');

console.log('Playback candidate tests passed');
