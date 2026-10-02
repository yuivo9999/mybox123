import assert from 'node:assert/strict';
import { parseM3U } from './src/adapters/live/m3uParser.js';
import { parseJSONLive } from './src/adapters/live/jsonParser.js';
import { normalizeLiveChannel, mergeLiveChannels } from './src/adapters/live/normalizeLive.js';
import { liveService } from './src/services/liveService.js';

const m3u = parseM3U('#EXTM3U\n#EXTINF:-1 tvg-id="news" group-title="新闻",News One\nhttps://example.com/news.m3u8');
assert.equal(m3u.length, 1);
assert.equal(m3u[0].sourceItemId, 'news');
assert.equal(m3u[0].category, '新闻');

const json = parseJSONLive({ channels: [{ id: 'news', name: 'News One', category: '新闻', urls: ['https://example.com/a.m3u8', 'https://example.com/b.m3u8'] }] });
assert.equal(json[0].streams.length, 2);

const a = normalizeLiveChannel({ sourceId: 'a', item: { sourceItemId: 'news', name: 'News One', category: '新闻', streams: [{ url: 'https://example.com/a.m3u8' }] } });
const b = normalizeLiveChannel({ sourceId: 'b', item: { sourceItemId: 'news', name: 'News One', category: '新闻', streams: [{ url: 'https://example.com/b.m3u8' }] } });
const merged = mergeLiveChannels([a, b]);
assert.equal(merged.length, 1);
assert.equal(merged[0].sourceRefs.length, 2);
assert.equal(merged[0].streams.length, 2);
console.log('Live adapter tests passed');

const serviceChannels = liveService.getChannels(merged);
assert.deepEqual(liveService.getCategories(serviceChannels), ['全部', '新闻']);
assert.equal(liveService.listChannels(serviceChannels, { category: '新闻' }).length, 1);
const epg = await liveService.getEPG(serviceChannels[0], {});
assert.deepEqual(epg, []);
