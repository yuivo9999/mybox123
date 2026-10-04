import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tv1LiveService } from '../../src/services/tv1LiveService.js';

const source = (sourceId, localContent) => ({
  sourceId,
  sourceType: 'live',
  liveMode: 'tv1',
  sourceRef: 'local:' + sourceId,
  localContent,
});

test('TV1 session is invalidated when the same sourceId changes content identity', async () => {
  tv1LiveService.clear();
  const a = source('source-a', '频道 A,http://a.example/live.m3u8\n');
  const first = await tv1LiveService.loadMetadata(a);
  assert.equal(first[0].name, '频道 A');

  const b = source('source-a', '频道 B,http://b.example/live.m3u8\n');
  const second = await tv1LiveService.loadMetadata(b);
  assert.equal(second[0].name, '频道 B');

  tv1LiveService.clear();
});

test('TV1 source can be explicitly removed without leaking its session', async () => {
  tv1LiveService.clear();
  const a = source('source-a', '频道 A,http://a.example/live.m3u8\n');
  await tv1LiveService.loadMetadata(a);

  tv1LiveService.clear('source-a');
  const streams = await tv1LiveService.getStreams(a, {
    sourceId: 'source-a',
    sourceItemId: '0',
    deferredRef: { lineIndex: 0 },
  });

  assert.equal(streams.length, 1);
  assert.equal(streams[0].sourceId, 'source-a');
  tv1LiveService.clear();
});

test('aborted TV1 metadata does not leave a reusable session', async () => {
  tv1LiveService.clear();
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    tv1LiveService.loadMetadata(source('source-abort', '频道 A,http://a.example/live.m3u8\n'), {
      signal: controller.signal,
    }),
    error => error?.name === 'AbortError',
  );

  const fresh = await tv1LiveService.loadMetadata(
    source('source-abort', '频道 B,http://b.example/live.m3u8\n'),
  );
  assert.equal(fresh[0].name, '频道 B');
  tv1LiveService.clear();
});
