import { parseJSONLive } from './jsonParser.js';
import { parseM3U } from './m3uParser.js';
import { parseXMLLive, parseXMLEPG } from './xmlParser.js';
import { normalizeLiveChannel } from './normalizeLive.js';

export function createLiveAdapter(config, transport = fetch) {
  const sourceId = config.sourceId;
  let snapshot = [];
  let lastError = null;

  const load = async () => {
    try {
      const response = await transport(config.sourceRef, { headers: config.headers ?? {} });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const body = await response.text();
      const format = detectFormat(config.format, response.headers.get('content-type'), body);
      const raw = format === 'm3u' ? parseM3U(body) : format === 'xml' ? parseXMLLive(body) : parseJSONLive(body);
      const epgPrograms = format === 'xml' ? parseXMLEPG(body) : [];
      const withEPG = raw.map((item) => ({
        ...item,
        epg: [...(item.epg ?? []), ...epgPrograms.filter((program) => program.channelRef === item.sourceItemId || program.channelRef === item.channelKey)],
      }));
      snapshot = withEPG.map((item, index) => normalizeLiveChannel({ sourceId, item, index }));
      lastError = null;
      return snapshot;
    } catch (error) {
      lastError = { code: error?.message || 'LIVE_ADAPTER_ERROR', sourceId };
      throw error;
    }
  };

  return {
    sourceId,
    getChannels: load,
    getCategories: async () => [...new Set((snapshot.length ? snapshot : await load()).map((channel) => channel.category))],
    getStreams: async (channelRef) => (snapshot.length ? snapshot : await load()).find((channel) => channel.channelId === channelRef?.channelId)?.streams ?? [],
    getEPG: async (channelRef, range = {}) => {
      const channel = (snapshot.length ? snapshot : await load()).find((item) => item.channelId === channelRef?.channelId);
      return (channel?.epg ?? []).filter((program) => (!range.startAt || program.endAt >= range.startAt) && (!range.endAt || program.startAt <= range.endAt));
    },
    healthCheck: async () => ({ ok: !lastError, sourceId, error: lastError, checkedAt: Date.now() }),
  };
}

function detectFormat(explicit, contentType = '', body = '') {
  if (explicit) return explicit;
  if (/mpegurl|m3u/i.test(contentType) || /^#EXTM3U/i.test(body.trim())) return 'm3u';
  if (/xml/i.test(contentType) || /^<\?xml|^<tv[\s>]/i.test(body.trim())) return 'xml';
  return 'json';
}
