import assert from 'node:assert/strict';
import { parserService } from './src/parsers/parserService.js';
import { ParserErrorCode } from './src/models/parser.js';

const mp4 = await parserService.resolve({
  mediaUrl: 'https://example.com/video.mp4',
  protocol: 'mp4',
  headers: { Accept: 'video/mp4' },
  referer: 'https://example.com/',
});
assert.equal(mp4.url, 'https://example.com/video.mp4');
assert.equal(mp4.protocol, 'mp4');
assert.equal(mp4.headers.Accept, 'video/mp4');
assert.equal(mp4.referer, 'https://example.com/');

const hls = await parserService.resolve({
  mediaUrl: 'https://example.com/master.m3u8',
  protocol: 'hls',
  parserHint: 'hls',
  metadata: { manifestText: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720\n720.m3u8' },
});
assert.equal(hls.protocol, 'hls');
assert.equal(hls.manifest.variants[0].url, 'https://example.com/720.m3u8');

await assert.rejects(
  () => parserService.resolve({ mediaUrl: '' }),
  (error) => error.message === ParserErrorCode.INPUT_INVALID,
);

await assert.rejects(
  () => parserService.resolve({ mediaUrl: 'https://example.com/expired.m3u8', expiresAt: Date.now() - 1 }),
  (error) => error.message === ParserErrorCode.SESSION_EXPIRED,
);

console.log('Parser core tests passed');
