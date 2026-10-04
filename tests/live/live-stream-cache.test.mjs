import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getLiveStreamCacheKey } from '../../src/features/live/LiveFeature.jsx';

test('deferred stream cache key is source-aware for merged channels', () => {
  const channel = {
    channelId: 'channel:canonical:news',
    sourceRefs: [
      { sourceId: 'source-a', sourceItemId: '1' },
      { sourceId: 'source-b', sourceItemId: '9' },
    ],
    deferredRef: { lineIndex: 1 },
  };

  assert.notEqual(
    getLiveStreamCacheKey(channel, [
      { sourceId: 'source-a', sourceType: 'live', enabled: true },
      { sourceId: 'source-b', sourceType: 'live', enabled: false },
    ]),
    getLiveStreamCacheKey(channel, [
      { sourceId: 'source-a', sourceType: 'live', enabled: false },
      { sourceId: 'source-b', sourceType: 'live', enabled: true },
    ]),
  );
});

test('disabled source is not selected when another source remains enabled', () => {
  const channel = {
    channelId: 'channel:canonical:news',
    sourceRefs: [
      { sourceId: 'source-a', sourceItemId: '1' },
      { sourceId: 'source-b', sourceItemId: '9' },
    ],
  };

  assert.match(
    getLiveStreamCacheKey(channel, [
      { sourceId: 'source-a', sourceType: 'live', enabled: false },
      { sourceId: 'source-b', sourceType: 'live', enabled: true },
    ]),
    /^source-b\u0000/,
  );
});
